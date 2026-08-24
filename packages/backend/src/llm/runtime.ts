import type { Config } from "../config.js";

/**
 * LLM stage runtime — a lazily-created pi SDK ModelRuntime.
 *
 * Auth resolution (pi priority): runtime API key override (RERANK_API_KEY) →
 * ~/.pi/agent/auth.json (your pi login) → env vars. No ModelRuntime is created
 * until the first rerank, so the API server stays lightweight without an LLM.
 */
export interface StageRuntime {
  provider: string;
  model: string;
  apiKey?: string;
}

export function stageRuntimeFromConfig(config: Config): StageRuntime {
  return {
    provider: config.RERANK_PROVIDER,
    model: config.RERANK_MODEL,
    apiKey: config.RERANK_API_KEY || undefined,
  };
}