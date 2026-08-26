import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { QueryExpander } from "./expand.js";
import type { StageRuntime } from "./runtime.js";

const EXPAND_PROMPT = `You are a query-expansion specialist for a research retrieval
system. Rewrite the user's query into several effective search variants.

Rules:
- Keep every variant semantic-broadening and on-topic for AI/ML research.
- Cover different angles: synonyms, broader/narrower terms, likely phrasing.
- Skip variants only if you are confident they hurt recall.
- You MUST call the expand_query tool. Do NOT write a textual answer.`;

interface ExpandPayload {
  queries: string[];
}

const expandTool = defineTool({
  name: "expand_query",
  label: "Expand Query",
  description:
    "Return diverse phrasings of the user's query for multi-query retrieval. Call this as your final action.",
  parameters: Type.Object({
    queries: Type.Array(Type.String(), {
      description: "Three to five query variants (include a close paraphrase of the original)",
    }),
  }),
  promptSnippet: "Generate query variants for multi-query retrieval",
  promptGuidelines: [
    "Use expand_query as your final action after drafting variants.",
    "Return 3–5 concise variants; do not pad with irrelevant generalities.",
    "After calling expand_query, do not follow up with a text answer.",
  ],
  async execute(_toolCallId, params) {
    return { content: [{ type: "text", text: `Expanded to ${params.queries.length} queries` }], details: { queries: params.queries } satisfies ExpandPayload, terminate: true };
  },
});

/** Isolated resource loader — no user extensions/skills/prompts leak into the stage. */
function isolatedLoader(systemPrompt: string): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

/**
 * LLM query expander backed by a pi SDK agent session with a terminating
 * structured tool. Lazy ModelRuntime (auth: env key or ~/.pi/agent login).
 */
export function createPiExpander(runtime: StageRuntime, timeoutMs = 60_000): QueryExpander {
  let modelPromise: Promise<ModelRuntime> | null = null;

  async function getModelRuntime(): Promise<ModelRuntime> {
    modelPromise ??= (async () => {
      const mr = await ModelRuntime.create();
      if (runtime.apiKey) await mr.setRuntimeApiKey(runtime.provider, runtime.apiKey);
      return mr;
    })();
    return modelPromise;
  }

  return {
    model: `${runtime.provider}/${runtime.model}`,
    async expand(query: string): Promise<string[]> {
      const modelRuntime = await getModelRuntime();
      const model = modelRuntime.getModel(runtime.provider, runtime.model);
      if (!model) {
        throw new Error(
          `expand model ${runtime.provider}/${runtime.model} not found — set RERANK_MODEL or check credentials`,
        );
      }

      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await runOnce(modelRuntime, model, query, timeoutMs);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw lastError ?? new Error("expand failed");
    },
  };
}

async function runOnce(
  modelRuntime: ModelRuntime,
  model: NonNullable<ReturnType<ModelRuntime["getModel"]>>,
  query: string,
  timeoutMs: number,
): Promise<string[]> {
  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    modelRuntime,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 1 },
    }),
    resourceLoader: isolatedLoader(EXPAND_PROMPT),
    // Must name the custom tool explicitly or it's disabled.
    tools: ["expand_query"],
    customTools: [expandTool],
  });

  try {
    let payload: ExpandPayload["queries"] | null = null;
    session.subscribe((event) => {
      if (event.type === "tool_execution_end" && event.toolName === "expand_query" && !event.isError) {
        const details = event.result?.details as ExpandPayload | undefined;
        if (Array.isArray(details?.queries)) payload = details.queries;
      }
    });

    await Promise.race([
      session.prompt(`QUERY: ${query}\n\nGenerate search variants now.`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`expand timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

    if (!payload) {
      const state = session.agent.state;
      const lastAssistant = [...state.messages].reverse().find((m) => m.role === "assistant");
      const stopReason = (lastAssistant as { stopReason?: string } | undefined)?.stopReason;
      throw new Error(
        `expander did not return queries (stopReason=${stopReason ?? "unknown"}, ` +
          `stateError=${state.errorMessage ?? "none"})`,
      );
    }

    const queries = payload as string[];
    const clean = queries.map((q) => q.trim()).filter(Boolean);
    if (clean.length === 0) throw new Error("expander returned no queries");
    // Always lead with the original query.
    return [query, ...clean.filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 6);
  } finally {
    session.dispose();
  }
}