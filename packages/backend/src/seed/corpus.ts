import type { DocumentInput } from "@curate-ai/shared";

/**
 * Bundled sample corpus — realistic AI/ML research & engineering content so the
 * baseline works offline and tests are deterministic. Each entry is several
 * paragraphs so chunking + embedding + hybrid search behave like production data.
 */
export const SEED_DOCUMENTS: DocumentInput[] = [
  {
    title: "Attention Is All You Need: the transformer architecture explained",
    url: "https://arxiv.org/abs/1706.03762",
    source: "arXiv",
    sourceType: "arxiv",
    summary: "The seminal paper that introduced the transformer architecture, replacing recurrence with self-attention.",
    content:
      "The transformer architecture introduced in 2017 replaced recurrent neural networks with a purely attention-based mechanism. Instead of processing tokens sequentially, the transformer computes attention scores between every pair of positions in parallel, allowing the model to directly relate distant tokens. Multi-head attention runs several attention computations in parallel, each learning different relationships such as syntax, coreference, or positional structure. Positional encodings inject order information because self-attention is permutation invariant. Layer normalization, residual connections, and feed-forward blocks complete each encoder and decoder layer. The architecture scaled remarkably well: larger transformers with more parameters, more data, and more compute consistently improved downstream performance. Modern language models, vision transformers, and multimodal systems all descend from this design. The key insight remains that learned attention can replace hand-designed recurrence while training far faster due to parallelism.",
    tags: ["transformers", "attention", "architecture", "nlp"],
    publishedAt: "2017-06-12T00:00:00Z",
    metadata: { primaryCategory: "cs.CL" },
  },
  {
    title: "Retrieval-Augmented Generation (RAG): grounding LLMs in external knowledge",
    url: "https://arxiv.org/abs/2005.11401",
    source: "arXiv",
    sourceType: "arxiv",
    summary: "RAG combines a parametric sequence-to-sequence model with a non-parametric dense retriever over a knowledge corpus.",
    content:
      "Retrieval-augmented generation couples a dense retriever with a generator so the model can consult a large external corpus at inference time. The retriever encodes both queries and passages into the same embedding space, then returns the nearest neighbors to the query. The generator conditions on both the query and the retrieved passages, which lets it answer questions whose answers change over time or live outside the training data. RAG reduces hallucination because the model can point at evidence, and it makes updating knowledge as easy as reindexing the corpus rather than retraining weights. The two main families are naive RAG, which retrieves once and generates, and iterative or agentic RAG, which alternates retrieval and generation to plan multi-hop reasoning. Hybrid retrieval, which fuses sparse keyword scoring with dense vectors, generally outperforms either alone because lexical and semantic signals complement each other. Evaluation of RAG systems typically measures retrieval recall separately from generation faithfulness.",
    tags: ["rag", "retrieval", "generation", "nlp"],
    publishedAt: "2020-05-22T00:00:00Z",
    metadata: { primaryCategory: "cs.CL" },
  },
  {
    title: "Dense embeddings: turning text into vectors for semantic search",
    url: "https://example.com/embeddings-guide",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "A practical guide to text embeddings, similarity metrics, and when dense beats sparse retrieval.",
    content:
      "Text embeddings map strings to fixed-size vectors such that semantically similar texts are close in vector space. Sentence-transformer style models like all-MiniLM-L6-v2 produce 384-dimensional, unit-normalized embeddings from a pooled transformer encoder. Cosine similarity is the standard metric: the dot product of two normalized vectors gives a value between negative one and one, with one meaning identical direction. Embeddings power semantic search, clustering, deduplication, and recommendation. Dense retrieval shines at capturing paraphrase and synonymy: 'car' and 'automobile' land near each other even though they share no characters. Sparse retrieval, in contrast, excels at exact terms, IDs, and rare proper nouns. The practical answer is to combine both with reciprocal rank fusion rather than choose. Embedding quality depends heavily on the training data; general models underperform domain-specific fine-tuned ones. Chunking matters too: embeddings of long passages dilute meaning, so documents are usually split into overlapping chunks before indexing.",
    tags: ["embeddings", "semantic search", "vector", "similarity"],
    publishedAt: "2025-01-15T00:00:00Z",
    metadata: {},
  },
  {
    title: "Vector databases and ANN indexes: HNSW, IVF, and brute force",
    url: "https://example.com/vector-databases",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "How approximate nearest neighbor search works and why exact search doesn't scale.",
    content:
      "Vector databases index embeddings for fast nearest-neighbor lookup at scale. Exact k-nearest-neighbor search compares the query against every stored vector, which is fine for thousands of points but impractical at millions. Approximate nearest neighbor (ANN) indexes trade a small amount of recall for orders of magnitude less work. HNSW builds a hierarchical graph of navigable small-world connections; searches walk the graph from coarse to fine layers, visiting far fewer nodes than brute force. IVF partitions the space with k-means centroids and only probes the closest clusters. Both support cosine distance for normalized vectors and L2 for raw ones. Real systems add metadata filters, hybrid fusion with keyword search, and incremental indexing. SQLite itself now hosts ANN indexes: sqlite-vec implements a vec0 virtual table with HNSW-style search over Float32 blobs, making vector search available in the same transactional database as the rest of the application.",
    tags: ["vector databases", "hnsw", "ann", "sqlite"],
    publishedAt: "2025-02-03T00:00:00Z",
    metadata: {},
  },
  {
    title: "Hybrid search with Reciprocal Rank Fusion",
    url: "https://example.com/rrf-explained",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "Fusing BM25 and dense vectors with RRF for robust retrieval without score calibration.",
    content:
      "Hybrid search combines sparse keyword retrieval with dense semantic retrieval. The hard part is merging two incomparable score scales: BM25 scores depend on term frequencies and corpus statistics, while cosine similarities live in embedding space. Reciprocal Rank Fusion sidesteps calibration entirely. Each retrieval system produces a ranked list; for each document, RRF sums one over k plus its rank across every list. A document ranked highly by both techniques accumulates a large fusion score, while documents only one system likes rank lower. The constant k, typically 60, smooths the contribution of low ranks. RRF is parameter-light, robust, and used in production by Lucene and Elastic. It also degrades gracefully: if one retriever returns nothing, the fusion reduces to the other. The technique composes well with reranking, where a cross-encoder reorders the top fusion candidates for the final answer.",
    tags: ["hybrid search", "rrf", "bm25", "fusion"],
    publishedAt: "2025-02-20T00:00:00Z",
    metadata: {},
  },
  {
    title: "BM25 and FTS5: what keyword search still gets right",
    url: "https://example.com/bm25-fts5",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "Why sparse retrieval survives the embedding era, and how SQLite FTS5 implements it.",
    content:
      "BM25 is the classic probabilistic ranking function for keyword search. It scores a document by how often query terms appear, discounted by document length and smoothed by corpus-wide term frequency. Rare terms contribute more than common ones, which is why BM25 handles stopword-heavy queries gracefully. SQLite ships FTS5, a full-text search engine implementing BM25 ranking with a powerful query language, prefix and phrase matching, and the porter stemming extension for English. FTS5 stores a forward index of tokens per document and an inverted index mapping tokens to documents. Keyword search remains indispensable for retrieval: identifiers, version numbers, error messages, and exact technical terms are lexical matches that embeddings blur. Production retrieval pipelines routinely run BM25 and dense search side by side, fusing results rather than betting on one.",
    tags: ["bm25", "fts5", "full-text search", "sqlite"],
    publishedAt: "2025-03-01T00:00:00Z",
    metadata: {},
  },
  {
    title: "Chunking strategies for RAG: size, overlap, and structure",
    url: "https://example.com/chunking-strategies",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "How document chunking determines embedding quality and retrieval precision.",
    content:
      "Chunking is the quiet bottleneck of retrieval quality. Embedders have fixed context windows and pooled representations dilute long inputs, so documents are split into chunks before indexing. Naive fixed-size chunking by character or token count is simple but cuts sentences and sections mid-thought. Sentence-aligned chunking preserves grammatical units. Semantic chunking uses embedding similarity between adjacent sentences to find natural boundaries. Overlap between chunks prevents the information straddling a boundary from being lost to both chunks. Chunk size trades precision against recall: small chunks match more precisely but lose surrounding context, large chunks keep context but dilute the query match. The right size depends on the downstream task; question answering usually prefers smaller chunks with the ability to expand to the enclosing section at generation time. Whatever the strategy, the corpus should be chunked and indexed once, then evaluated end to end.",
    tags: ["chunking", "rag", "indexing", "retrieval"],
    publishedAt: "2025-03-10T00:00:00Z",
    metadata: {},
  },
  {
    title: "Reranking search results with cross-encoders",
    url: "https://example.com/reranking",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "Two-stage retrieval: cheap candidate generation, expensive but precise reranking.",
    content:
      "Two-stage retrieval decouples recall from precision. The first stage, bi-encoder search, embeds query and documents independently, enabling fast ANN lookup over millions of items but missing fine-grained interactions. The second stage takes the top few dozen candidates and scores them with a cross-encoder: a model that reads the query and each candidate together, producing an interaction-aware relevance score. Cross-encoders are far more accurate and far slower, which is exactly why they rerank a small candidate set instead of scanning the corpus. The technique lifts precision dramatically for question answering and retrieval evaluation. LLM-based rerankers go further, asking a language model to judge or even reason about relevance, at higher latency and cost. Reranking composes with hybrid retrieval: fuse BM25 and dense results, then rerank the fusion winners.",
    tags: ["reranking", "cross-encoder", "two-stage", "precision"],
    publishedAt: "2025-03-18T00:00:00Z",
    metadata: {},
  },
  {
    title: "Building LLM agents that use tools reliably",
    url: "https://example.com/agents-tools",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "Structured tool schemas, function calling, and the loop between model and environment.",
    content:
      "Tool-using agents extend a language model with the ability to call functions. The model emits structured arguments against a declared schema, the host executes the call, and the result feeds back into the conversation. Reliability depends on schema quality: clear descriptions, strict types, and small parameter surfaces reduce malformed calls. Most providers expose native function calling, where the model returns a typed tool call instead of free-form JSON. Agents loop over tool calls until they reach an answer or a stop condition, with guardrails on iteration count and budget. Deterministic pipelines remain preferable to open-ended loops when the workflow is known; agentic behavior pays off when the path to the goal is unpredictable. Observability matters: every tool call should be logged with its input, output, and latency for debugging and evaluation.",
    tags: ["agents", "tool use", "function calling", "llm"],
    publishedAt: "2025-04-02T00:00:00Z",
    metadata: {},
  },
  {
    title: "Quantization for local LLMs: GGUF, int4, and memory trade-offs",
    url: "https://example.com/quantization",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "Running large models on commodity hardware by compressing weights.",
    content:
      "Quantization compresses model weights from 16-bit floats to 8-bit or 4-bit integers, cutting memory footprint by 75 to 90 percent. The GGUF format popularized by llama.cpp stores quantized weights together with the tokenizer and metadata, making single-file model distribution practical. Q4_K_M is a common sweet spot for llama.cpp: roughly four bits per weight with a small quality loss on most tasks. Quantization matters because memory, not compute, usually limits local inference: a 70B parameter model needs about 140 gigabytes at fp16 but fits in 40 gigabytes at q4. The quality cost is task-dependent; generation degrades less than exact reasoning benchmarks. Calibration-aware quantization, where scaling factors are fit on representative data, recovers much of the gap. Local models trade peak quality for privacy, cost, and latency, and the gap narrows every release cycle.",
    tags: ["quantization", "gguf", "local llm", "inference"],
    publishedAt: "2025-04-15T00:00:00Z",
    metadata: {},
  },
  {
    title: "Parameter-efficient fine-tuning with LoRA",
    url: "https://example.com/lora-finetuning",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "Adapting large models to new domains by training small low-rank adapters.",
    content:
      "LoRA freezes the base model and trains a small set of low-rank adapter matrices that update the weights implicitly. Instead of learning a full delta matrix, LoRA learns two small factors whose product approximates it, cutting trainable parameters by orders of magnitude. Adapters can be swapped at inference time without duplicating the base model, enabling cheap domain specialization. QLoRA combines quantization with LoRA so a 7B model can be adapted on a single consumer GPU. The typical workflow gathers a few thousand high-quality examples, formats them into a chat template, and trains for a few epochs with a low learning rate. Fine-tuning beats prompt engineering for style, format, and domain terminology, while base-model capabilities are preserved. Retrieval-augmented pipelines and fine-tuning are complementary: retrieval supplies fresh knowledge, adapters supply behavior and tone.",
    tags: ["lora", "fine-tuning", "qlora", "adapters"],
    publishedAt: "2025-05-01T00:00:00Z",
    metadata: {},
  },
  {
    title: "Evaluating RAG systems: retrieval metrics and end-to-end benchmarks",
    url: "https://example.com/rag-evals",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "Recall@k, MRR, NDCG, and why you should also measure the final answer.",
    content:
      "RAG evaluation splits into retrieval quality and generation quality. Retrieval metrics compare the returned candidates against a gold set: recall@k measures whether the right passages made the top k, MRR rewards ranking the first relevant hit early, and NDCG accounts for graded relevance across the whole list. These metrics are cheap and offline, which makes them ideal for iterating on chunking, embedding, and fusion choices. Generation quality needs human judgment or LLM-as-judge rubrics for faithfulness, completeness, and helpfulness. Faithfulness is the metric that matters most: does the answer stay grounded in the retrieved passages rather than hallucinating? A common failure is high retrieval recall with low answer quality because the generator ignored the evidence. Build a small gold set for your own domain early; public benchmarks generalize poorly to personal corpora.",
    tags: ["evaluation", "rag", "recall", "metrics"],
    publishedAt: "2025-05-12T00:00:00Z",
    metadata: {},
  },
  {
    title: "What the community is saying about running 7B models on a laptop",
    url: "https://www.reddit.com/r/LocalLLaMA/comments/example",
    source: "r/LocalLLaMA",
    sourceType: "reddit",
    summary: "A Reddit discussion on practical memory usage, quantization choices, and surprising quality.",
    content:
      "Thread in r/LocalLLaMA about local inference. Several users report running 7B quantized models comfortably in 8 gigabytes of RAM with llama.cpp, using Q4_K_M for a balance of speed and quality. Commenters note that memory bandwidth, not compute, is the bottleneck for token generation on laptops. Others share that 3B models are enough for summarization and classification while 7B models handle more complex reasoning. A common recommendation is to keep the model small and the retrieval good: a compact model with a solid RAG pipeline beats a large model guessing from memory. The discussion also covers quantized embeddings for offline semantic search and hybrid ranking to fix the exact-match cases small models miss.",
    tags: ["local llm", "quantization", "llama.cpp", "discussion"],
    publishedAt: "2025-06-02T00:00:00Z",
    metadata: { score: 842, numComments: 137 },
  },
  {
    title: "Weekly AI research digest: transformers, retrieval, and agents",
    url: "https://example.com/weekly-digest",
    source: "AI Weekly Digest",
    sourceType: "rss",
    summary: "A digest of the week's notable AI research and engineering posts.",
    content:
      "This week's digest: a new paper revisits long-context transformers with sliding-window attention and claims competitive quality at a fraction of the memory cost. Engineering posts cover hybrid retrieval at scale, comparing BM25, dense vectors, and reciprocal rank fusion across a 10 million document index. A guide on reranking with cross-encoders reports measurable gains on a question-answering benchmark after fusing sparse and dense candidates. On the agent front, structured tool schemas with strict type validation cut malformed function calls in half in a reported production system. Finally, an evaluation post makes the case for building a small gold set for retrieval metrics before tuning chunk sizes, warning that public benchmarks overfit to their own corpora. Next week's issue will focus on evaluation tooling and local embedding models.",
    tags: ["digest", "research", "retrieval", "agents"],
    publishedAt: "2025-06-10T00:00:00Z",
    metadata: { feed: "https://example.com/weekly-digest" },
  },
  {
    title: "Model Context Protocol (MCP): a standard for LLM tool integration",
    url: "https://example.com/mcp-guide",
    source: "Seed Guide",
    sourceType: "seed",
    summary: "How MCP standardizes the interface between LLM hosts and external tools and data.",
    content:
      "The Model Context Protocol standardizes how LLM applications talk to external tools, data sources, and services. A host, like an IDE or a coding agent, connects to MCP servers that expose capabilities: tools the model can call, resources it can read, and prompts it can reuse. The protocol replaces per-integration glue with a common JSON-RPC transport, so the same server works across many clients. MCP servers run as local processes or remote endpoints, and sessions carry authentication and capability negotiation. For retrieval-heavy applications, MCP servers often wrap search indexes, databases, or web search APIs behind a uniform tool interface. The standardization reduces integration cost but raises the question of governance: which tools a model may call, with what permissions, is a policy decision the host must enforce regardless of protocol.",
    tags: ["mcp", "tools", "protocol", "integration"],
    publishedAt: "2025-06-18T00:00:00Z",
    metadata: {},
  },
];
