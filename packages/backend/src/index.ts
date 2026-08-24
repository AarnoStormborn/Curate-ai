import "dotenv/config";
import { loadConfig } from "./config.js";
import { openDb } from "./db/client.js";
import { createLocalEmbedder } from "./embeddings/local.js";
import { indexDocuments } from "./retrieval/indexer.js";
import { SEED_DOCUMENTS } from "./seed/corpus.js";
import { fetchLiveSources } from "./ingestion/manager.js";
import { toDocumentInput } from "./ingestion/types.js";
import { countChunks, countDocuments, getDocumentByUrl, getRecentRuns, lastIngestAt, sourceCounts } from "./db/repo.js";
import { startServer } from "./server.js";
import { createSearchService } from "./retrieval/search.js";
import { evaluate, EVAL_MODES, formatEvalTable } from "./retrieval/evaluate.js";
import { GOLD_SET } from "./seed/gold-set.js";
import type { SearchMode } from "@curate-ai/shared";
import { createPiReranker } from "./llm/pi-reranker.js";
import { stageRuntimeFromConfig } from "./llm/runtime.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function usage(): void {
  console.log(`curate-ai — retrieval-first research curation

Usage:
  curate-ai serve                 Start the Fastify API server
  curate-ai seed                  Index the bundled sample corpus
  curate-ai ingest [--live] [--sources arxiv,rss,reddit]
                                  Index seed corpus, or fetch live sources
  curate-ai eval [--k 10] [--mode all|hybrid|bm25|vector]
                                  Run the gold set and report recall@k / MRR / NDCG
  curate-ai search "query"        CLI search against the index
  curate-ai stats                 Index + run statistics
  curate-ai runs                  Recent ingest runs
`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "serve": {
      const { close } = await startServer(config);
      const shutdown = async (): Promise<void> => {
        await close();
        process.exit(0);
      };
      process.on("SIGINT", () => void shutdown());
      process.on("SIGTERM", () => void shutdown());
      return;
    }

    case "seed": {
      const db = openDb(config.DATABASE_PATH, config.EMBEDDING_DIM);
      const embedder = createLocalEmbedder(config.EMBEDDING_MODEL, config.EMBEDDING_DIM, config.HF_CACHE);
      const t0 = performance.now();
      const result = await indexDocuments(db, embedder, SEED_DOCUMENTS);
      printJson({
        mode: "seed",
        ...result,
        tookMs: Math.round(performance.now() - t0),
        totalDocuments: countDocuments(db),
        totalChunks: countChunks(db),
      });
      db.close();
      return;
    }

    case "ingest": {
      const live = args.includes("--live");
      const sourcesArg = args.find((a) => a.startsWith("--sources="));
      const sources = sourcesArg
        ? (sourcesArg.split("=")[1]!.split(",").map((s) => s.trim()) as Array<"arxiv" | "rss" | "reddit">)
        : undefined;

      const db = openDb(config.DATABASE_PATH, config.EMBEDDING_DIM);
      const embedder = createLocalEmbedder(config.EMBEDDING_MODEL, config.EMBEDDING_DIM, config.HF_CACHE);
      const t0 = performance.now();

      if (live) {
        const { items, summaries } = await fetchLiveSources({
          sources,
          arxivMaxResults: config.ARXIV_MAX_RESULTS,
          arxivDaysBack: config.ARXIV_DAYS_LOOKBACK,
        });
        const result = await indexDocuments(db, embedder, items.map(toDocumentInput));
        printJson({ mode: "live", sources, summaries, ...result, tookMs: Math.round(performance.now() - t0) });
      } else {
        const result = await indexDocuments(db, embedder, SEED_DOCUMENTS);
        printJson({ mode: "seed", ...result, tookMs: Math.round(performance.now() - t0) });
      }
      db.close();
      return;
    }

    case "eval": {
      const k = Number(args.find((a) => a.startsWith("--k="))?.split("=")[1] ?? 10);
      const modeArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "all";
      const modes: SearchMode[] =
        modeArg === "all" ? [...EVAL_MODES] : ([modeArg] as SearchMode[]);

      const db = openDb(config.DATABASE_PATH, config.EMBEDDING_DIM);
      const embedder = createLocalEmbedder(config.EMBEDDING_MODEL, config.EMBEDDING_DIM, config.HF_CACHE);
      const search = createSearchService(db, embedder, {
        rerankTopN: config.RERANK_TOP_N,
        reranker: () => createPiReranker(stageRuntimeFromConfig(config), config.RERANK_TIMEOUT_MS),
      });

      const results = [];
      for (const mode of modes) {
        const result = await evaluate(search, GOLD_SET, mode, {
          k,
          resolveUrl: (url) => getDocumentByUrl(db, url)?.id ?? null,
        });
        results.push(result);
        const misses = result.queries.filter((q) => q.recallAtK < 1);
        if (misses.length > 0) {
          console.log(`\n[${mode}] missed queries (recall < 1):`);
          for (const m of misses) {
            console.log(`  - ${m.query}  (recall=${m.recallAtK.toFixed(2)} mrr=${m.mrr.toFixed(2)})`);
          }
        }
      }
      console.log("\n" + formatEvalTable(results));
      db.close();
      return;
    }

    case "search": {
      const q = args.join(" ");
      if (!q) {
        usage();
        process.exit(1);
      }
      const db = openDb(config.DATABASE_PATH, config.EMBEDDING_DIM);
      const embedder = createLocalEmbedder(config.EMBEDDING_MODEL, config.EMBEDDING_DIM, config.HF_CACHE);
      const search = createSearchService(db, embedder);
      const response = await search.search({ q, limit: 5, hybrid: true });
      printJson(response);
      db.close();
      return;
    }

    case "stats": {
      const db = openDb(config.DATABASE_PATH, config.EMBEDDING_DIM);
      printJson({
        documents: countDocuments(db),
        chunks: countChunks(db),
        sources: sourceCounts(db),
        lastIngest: lastIngestAt(db),
      });
      db.close();
      return;
    }

    case "runs": {
      const db = openDb(config.DATABASE_PATH, config.EMBEDDING_DIM);
      printJson(getRecentRuns(db));
      db.close();
      return;
    }

    default:
      usage();
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
