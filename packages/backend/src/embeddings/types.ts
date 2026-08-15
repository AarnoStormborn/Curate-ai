/** Embedder abstraction — swap local ONNX, API, or mock without touching search code. */
export interface Embedder {
  readonly model: string;
  readonly dim: number;
  /** Embed a batch of texts into normalized unit vectors. */
  embed(texts: string[]): Promise<Float32Array[]>;
}
