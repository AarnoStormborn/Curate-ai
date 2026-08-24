import type { FastifyInstance } from "fastify";
import { SearchRequest } from "@curate-ai/shared";
import type { SearchService } from "../retrieval/search.js";
import { ZodValidationError } from "../app.js";

interface SearchOptions {
  search: SearchService;
}

function parseSearchQuery(query: Record<string, unknown>): SearchRequest {
  const parsed = SearchRequest.safeParse({
    q: query.q,
    limit: query.limit !== undefined ? Number(query.limit) : undefined,
    hybrid: query.hybrid !== undefined ? query.hybrid !== "false" : undefined,
    mode: query.mode,
    sourceType: query.sourceType,
    from: query.from,
    to: query.to,
    includeSnippet: query.includeSnippet !== undefined ? query.includeSnippet !== "false" : undefined,
  });
  if (!parsed.success) {
    throw new ZodValidationError(parsed.error.flatten());
  }
  return parsed.data;
}

export function searchRoutes(app: FastifyInstance, opts: SearchOptions): void {
  app.get("/api/search", async (req, reply) => {
    const searchReq = parseSearchQuery(req.query as Record<string, unknown>);
    const response = await opts.search.search(searchReq);
    void reply.header("cache-control", "no-store");
    return response;
  });
}
