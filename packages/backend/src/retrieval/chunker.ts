export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  maxChars?: number;
  /** Characters of overlap carried into the next chunk to preserve context. */
  overlapChars?: number;
}

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;
const PARAGRAPH_BOUNDARY = /\n\s*\n/;

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

/**
 * Chunk text into overlapping sentence-aligned segments.
 *
 * Strategy (baseline):
 *  1. Split into paragraphs, then sentences.
 *  2. Greedily pack sentences up to `maxChars`.
 *  3. When a chunk closes, the next chunk starts with the tail of the previous
 *     chunk (`overlapChars`) so embedding context isn't cut at boundaries.
 *  4. A single sentence longer than `maxChars` is hard-split on word boundaries.
 *
 * Invariant: every returned chunk is ≤ maxChars.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 600;
  const overlapChars = options.overlapChars ?? 80;
  const normalized = normalize(text);
  if (!normalized) return [];

  const sentences: string[] = [];
  for (const paragraph of normalized.split(PARAGRAPH_BOUNDARY)) {
    sentences.push(...paragraph.split(SENTENCE_BOUNDARY).map((s) => s.trim()).filter(Boolean));
  }

  const chunks: string[] = [];
  let current = "";
  let carry = "";

  /** Split one oversized sentence into word-packed segments ≤ maxChars. */
  const hardSplit = (sentence: string): string[] => {
    const parts: string[] = [];
    let seg = "";
    for (const word of sentence.split(/\s+/)) {
      const candidate = seg ? `${seg} ${word}` : word;
      if (candidate.length > maxChars && seg) {
        parts.push(seg);
        seg = word;
      } else {
        seg = candidate;
      }
    }
    if (seg) parts.push(seg);
    return parts;
  };

  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
      carry = trimmed.slice(-overlapChars);
    }
    current = "";
  };

  const startWith = (sentence: string): void => {
    current = carry ? `${carry} ${sentence}` : sentence;
    if (current.length > maxChars) current = sentence; // drop carry if it overflows
  };

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) flush();

    if (sentence.length <= maxChars) {
      startWith(sentence);
    } else {
      const parts = hardSplit(sentence);
      for (const part of parts) {
        if (current) flush();
        startWith(part);
      }
    }
  }
  flush();

  return chunks;
}
