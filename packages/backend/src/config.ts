import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default("./data/curate.db"),
  EMBEDDING_MODEL: z.string().default("Xenova/all-MiniLM-L6-v2"),
  EMBEDDING_DIM: z.coerce.number().int().min(2).default(384),
  HF_CACHE: z.string().default("./data/hf-cache"),
  INGEST_SOURCES: z.string().default("arxiv,rss,reddit"),
  ARXIV_MAX_RESULTS: z.coerce.number().int().min(1).max(200).default(30),
  ARXIV_DAYS_LOOKBACK: z.coerce.number().int().min(1).default(7),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SOURCES_CONFIG: z.string().optional(),
  /** Seed the bundled corpus automatically when the index is empty (set false to disable). */
  AUTO_SEED: z.enum(["true", "false"]).default("true"),
});

export type Config = z.infer<typeof EnvSchema>;

/** Absolute path to the backend package root (works in src/, dist/, and tests). */
export function packageRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

function toAbsolute(root: string, p: string): string {
  return resolve(root, p);
}

/**
 * Load configuration from the environment (plus dotenv `.env`).
 * Relative paths are resolved against the backend package root.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const root = packageRoot();
  return {
    ...parsed,
    DATABASE_PATH:
      parsed.DATABASE_PATH === ":memory:" ? ":memory:" : toAbsolute(root, parsed.DATABASE_PATH),
    HF_CACHE: toAbsolute(root, parsed.HF_CACHE),
  };
}
