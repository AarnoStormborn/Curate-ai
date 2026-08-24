import type { Config } from "./config.js";
import { openDb } from "./db/client.js";
import { createLocalEmbedder } from "./embeddings/local.js";
import { createSearchService } from "./retrieval/search.js";
import { createIngestService } from "./services/ingest.js";
import { countDocuments } from "./db/repo.js";
import { buildApp } from "./app.js";
import { createPiReranker } from "./llm/pi-reranker.js";
import { stageRuntimeFromConfig } from "./llm/runtime.js";

/** Boot everything: DB → embedder → services → Fastify. */
export async function startServer(config: Config): Promise<{ close: () => Promise<void> }> {
  const db = openDb(config.DATABASE_PATH, config.EMBEDDING_DIM);
  const embedder = createLocalEmbedder(config.EMBEDDING_MODEL, config.EMBEDDING_DIM, config.HF_CACHE);
  const search = createSearchService(db, embedder, {
    rerankTopN: config.RERANK_TOP_N,
    // Lazy: the ModelRuntime (pi login / API key) is only touched for mode=rerank.
    reranker: () => createPiReranker(stageRuntimeFromConfig(config), config.RERANK_TIMEOUT_MS),
  });
  const ingest = createIngestService(db, embedder, config);

  // Out-of-the-box experience: seed the bundled corpus when the index is empty.
  if (config.AUTO_SEED !== "false" && countDocuments(db) === 0) {
    const t0 = performance.now();
    const seeded = await ingest.ingest({ mode: "seed" });
    console.log(
      `[curate-ai] auto-seeded ${seeded.indexed.indexed} documents (${seeded.indexed.chunks} chunks) in ${Math.round(performance.now() - t0)}ms`,
    );
  }

  const app = buildApp({ db, embedder, search, ingest, config });

  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info({ port: config.PORT, model: embedder.model }, "curate-ai server listening");

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await app.close();
    db.close();
  };
  return { close };
}
