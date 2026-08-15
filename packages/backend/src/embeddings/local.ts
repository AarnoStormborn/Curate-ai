import type { Embedder } from "./types.js";

/**
 * Local embedding via transformers.js (ONNX runtime in WASM).
 *
 * Model is downloaded once on first use into `env.cacheDir` (HF_CACHE) and
 * cached on disk — no API keys, fully offline afterwards.
 */
export function createLocalEmbedder(
  model: string,
  dim: number,
  cacheDir?: string,
): Embedder {
  let pipelinePromise: Promise<unknown> | null = null;

  async function getPipeline(): Promise<unknown> {
    if (!pipelinePromise) {
      pipelinePromise = (async () => {
        // Lazy import keeps the heavy module out of the hot path / tests.
        const { pipeline, env } = await import("@huggingface/transformers");
        if (cacheDir) env.cacheDir = cacheDir;
        env.allowRemoteModels = true;
        // q8 quantization: ~4x faster on CPU wasm, tiny quality loss, cached on disk.
        try {
          return await pipeline("feature-extraction", model, { dtype: "q8" });
        } catch {
          return await pipeline("feature-extraction", model);
        }
      })();
    }
    return pipelinePromise;
  }

  /** Normalize pipeline output (Tensor | Tensor[]) into number[][] rows. */
  function toRows(output: unknown): number[][] {
    const anyOut = output as {
      tolist?: () => number[] | number[][];
    };
    if (Array.isArray(output)) {
      return output.map((t) => {
        const l = (t as { tolist?: () => number[] }).tolist?.() ?? (t as number[]);
        return Array.isArray(l) ? (l as number[]) : [];
      });
    }
    const list = anyOut.tolist?.() as number[] | number[][] | undefined;
    if (Array.isArray(list) && Array.isArray(list[0])) return list as number[][];
    if (Array.isArray(list)) return [list as number[]];
    return [];
  }

  return {
    model,
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const extractor = await getPipeline();
      const run = async (batch: string[]) => {
        // @ts-expect-error — pipeline call signature varies across versions
        const output = await extractor(batch, { pooling: "mean", normalize: true });
        const rows = toRows(output);
        if (rows.length !== batch.length) {
          throw new Error(`embedder returned ${rows.length} rows for ${batch.length} texts`);
        }
        return rows.map((r) => Float32Array.from(r));
      };

      try {
        const results: Float32Array[] = [];
        for (let i = 0; i < texts.length; i += 16) {
          results.push(...(await run(texts.slice(i, i + 16))));
        }
        return results;
      } catch (batchErr) {
        // Some models reject batched inputs — fall back to one-by-one.
        const results: Float32Array[] = [];
        for (const t of texts) {
          results.push(...(await run([t])));
        }
        return results;
      }
    },
  };
}
