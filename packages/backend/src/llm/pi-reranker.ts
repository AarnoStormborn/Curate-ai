import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { RerankCandidate, RerankVerdict, Reranker } from "./rerank.js";
import type { StageRuntime } from "./runtime.js";

const RERANK_PROMPT = `You are an expert search-quality judge. Re-rank the candidate
documents below by relevance to the user's query. Use the title and snippet as
evidence. Best first. Keep all candidates — reorder only.

Rules:
- Relevance means: would this document help answer / inform the query?
- Penalize candidates that are topically adjacent but don't address the query.
- You MUST call the rerank_candidates tool with the full re-ranked list.
- Do NOT write a textual ranking. Your only output is the tool call.`;

/** Last-resort parse: the model answered in text as a numbered list. */
function parseTextVerdicts(text: string, candidateIds: Set<string>): RerankVerdict[] {
  const out: RerankVerdict[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\[(\w[-\w]*)\]/);
    const id = m?.[1];
    if (id && candidateIds.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push({ documentId: id, relevance: 1, reason: "parsed from textual ranking" });
    }
  }
  return out;
}

interface RankedPayload {
  ranked: Array<{ documentId?: unknown; relevance?: unknown; reason?: unknown }>;
}

const rerankTool = defineTool({
  name: "rerank_candidates",
  label: "Rerank Candidates",
  description:
    "Return the candidate documents re-ranked by relevance to the user's query. Call this as your final action with every candidate exactly once, best first.",
  parameters: Type.Object({
    ranked: Type.Array(
      Type.Object({
        documentId: Type.String({ description: "Candidate document id from the provided list" }),
        relevance: Type.Number({ description: "Relevance 0–1" }),
        reason: Type.String({ description: "One-sentence justification" }),
      }),
      { description: "All candidates, best first" },
    ),
  }),
  promptSnippet: "Re-rank search candidates by relevance",
  promptGuidelines: [
    "Use rerank_candidates as your final action after judging the candidates.",
    "Include every candidate exactly once; do not invent ids.",
    "After calling rerank_candidates, do not continue with a follow-up answer.",
  ],
  async execute(_toolCallId, params) {
    return {
      content: [{ type: "text", text: `Ranked ${params.ranked.length} candidates` }],
      details: { ranked: params.ranked } satisfies RankedPayload,
      terminate: true,
    };
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

function buildCandidateList(candidates: RerankCandidate[]): string {
  return candidates
    .map((c, i) => {
      const snippet = c.snippet.length > 280 ? `${c.snippet.slice(0, 277)}…` : c.snippet;
      const tags = c.tags.length > 0 ? ` [${c.tags.slice(0, 4).join(", ")}]` : "";
      return `${i + 1}. [${c.documentId}] ${c.title} (${c.sourceType}: ${c.source})${tags}\n   ${snippet}`;
    })
    .join("\n\n");
}

function validateVerdicts(
  verdicts: RankedPayload["ranked"],
  candidateIds: Set<string>,
): RerankVerdict[] {
  const seen = new Set<string>();
  const out: RerankVerdict[] = [];
  for (const v of verdicts) {
    if (typeof v.documentId !== "string") throw new Error("reranker returned a non-string documentId");
    if (!candidateIds.has(v.documentId)) continue; // model invented an id — drop, don't crash
    if (seen.has(v.documentId)) continue;
    seen.add(v.documentId);
    const relevance = typeof v.relevance === "number" && Number.isFinite(v.relevance) ? v.relevance : 0;
    out.push({
      documentId: v.documentId,
      relevance: Math.min(1, Math.max(0, relevance)),
      reason: typeof v.reason === "string" && v.reason ? v.reason.slice(0, 300) : "no reason given",
    });
  }
  return out;
}

/**
 * LLM reranker backed by a pi SDK agent session with a terminating structured
 * tool. Auth: RERANK_API_KEY env override or the user's ~/.pi/agent login.
 * ModelRuntime is created lazily on first use (server stays light without LLM).
 */
export function createPiReranker(runtime: StageRuntime, timeoutMs = 60_000): Reranker {
  let modelPromise: Promise<ModelRuntime> | null = null;

  async function getModelRuntime(): Promise<ModelRuntime> {
    modelPromise ??= (async () => {
      const mr = await ModelRuntime.create();
      if (runtime.apiKey) {
        await mr.setRuntimeApiKey(runtime.provider, runtime.apiKey);
      }
      return mr;
    })();
    return modelPromise;
  }

  return {
    model: `${runtime.provider}/${runtime.model}`,
    async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankVerdict[]> {
      if (candidates.length === 0) return [];
      const modelRuntime = await getModelRuntime();
      const model = modelRuntime.getModel(runtime.provider, runtime.model);
      if (!model) {
        throw new Error(
          `rerank model ${runtime.provider}/${runtime.model} not found — set RERANK_MODEL or check credentials`,
        );
      }

      const candidateIds = new Set(candidates.map((c) => c.documentId));
      const prompt = `${RERANK_PROMPT}\n\nQUERY: ${query}\n\nCANDIDATES:\n${buildCandidateList(candidates)}\n\nRe-rank these candidates now. Keep each reason under 12 words.`;

      // Provider APIs are flaky (malformed calls, transient 5xx) — retry a few
      // times before giving up to the search-level hybrid fallback.
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const verdicts = await runOnce(modelRuntime, model, prompt, candidateIds, timeoutMs);
          if (verdicts.length > 0) return verdicts;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw lastError ?? new Error("rerank failed");
    },
  };
}

async function runOnce(
  modelRuntime: ModelRuntime,
  model: NonNullable<ReturnType<ModelRuntime["getModel"]>>,
  prompt: string,
  candidateIds: Set<string>,
  timeoutMs: number,
): Promise<RerankVerdict[]> {
  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    modelRuntime,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 1 },
    }),
    resourceLoader: isolatedLoader(RERANK_PROMPT),
    // IMPORTANT: pass an explicit allowlist or custom tools are disabled.
    tools: ["rerank_candidates"],
    customTools: [rerankTool],
  });

  try {
    let payload: RankedPayload["ranked"] | null = null;
    session.subscribe((event) => {
      if (
        event.type === "tool_execution_end" &&
        event.toolName === "rerank_candidates" &&
        !event.isError
      ) {
        const details = event.result?.details as RankedPayload | undefined;
        if (Array.isArray(details?.ranked)) payload = details.ranked;
      }
    });

        await Promise.race([
          session.prompt(prompt),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`rerank timed out after ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);

        if (!payload) {
          // Last resort: the model may have answered in text despite instructions.
          const state = session.agent.state;
          const lastAssistant = [...state.messages].reverse().find((m) => m.role === "assistant");
          const text =
            lastAssistant && Array.isArray(lastAssistant.content)
              ? lastAssistant.content
                  .filter((c): c is { type: "text"; text: string } => c.type === "text")
                  .map((c) => c.text)
                  .join(" ")
              : "";
          const parsed = parseTextVerdicts(text, candidateIds);
          if (parsed.length > 0) {
            payload = parsed.map((v) => ({
              documentId: v.documentId,
              relevance: v.relevance,
              reason: v.reason,
            }));
          } else {
            const stopReason = (lastAssistant as { stopReason?: string } | undefined)?.stopReason;
            throw new Error(
              `reranker did not return a ranked list (stopReason=${stopReason ?? "unknown"}, ` +
                `stateError=${state.errorMessage ?? "none"}, text="${text.slice(0, 200)}")`,
            );
          }
        }
        const verdicts = validateVerdicts(payload, candidateIds);
        if (verdicts.length === 0) throw new Error("reranker returned no valid candidates");
        return verdicts;
  } finally {
    session.dispose();
  }
}

// Keep the ExtensionAPI import as a type-only reference for consumers.
export type { ExtensionAPI };