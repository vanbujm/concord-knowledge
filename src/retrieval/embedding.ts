import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import * as z from "zod";

import referenceEmbedding from "@/retrieval/embedding-reference.json";

// The single place text becomes a vector. Ingestion (index-time) and search
// (query-time) both import this, so they always use the same model, dtype, and
// pooling. If the two sides diverge, the stored vectors and the query vectors
// drift apart and ranking silently degrades.
//
// `dtype` is pinned to fp32 so the numbers do not change with quantisation. The
// execution backend is intentionally left to default per runtime (native
// onnxruntime under Bun/Node for ingestion; WASM in an edge/browser runtime for
// search), because the same weights at fp32 produce near-identical vectors
// across backends. `assertEmbeddingParity` is the guard: it fails loudly if a
// backend, model, or dtype change ever pushes a canonical embedding out of
// tolerance.

export const EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";
export const EMBEDDING_DIMENSIONS = 384;

const EMBEDDING_DTYPE = "fp32";

// bge retrieval models expect this instruction prepended to queries only, not
// to the documents being searched.
const QUERY_INSTRUCTION =
  "Represent this sentence for searching relevant passages: ";

export type EmbedKind = "query" | "document";

const embeddingMatrixSchema = z.array(z.array(z.number()));

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

const getExtractor = (): Promise<FeatureExtractionPipeline> => {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE,
    });
  }

  return extractorPromise;
};

const applyInstruction = (text: string, kind: EmbedKind): string =>
  kind === "query" ? `${QUERY_INSTRUCTION}${text}` : text;

// Embed a batch of texts into unit-normalized 384-dimension vectors.
export const embedTexts = async (
  texts: string[],
  kind: EmbedKind,
): Promise<number[][]> => {
  const extractor = await getExtractor();
  const prepared = texts.map((text) => applyInstruction(text, kind));

  const output = await extractor(prepared, {
    pooling: "mean",
    normalize: true,
  });

  return embeddingMatrixSchema.parse(output.tolist());
};

export const embedText = async (
  text: string,
  kind: EmbedKind,
): Promise<number[]> => {
  const [vector] = await embedTexts([text], kind);

  return vector;
};

const PARITY_MIN_COSINE = 0.999;

const dotProduct = (first: number[], second: number[]): number => {
  let total = 0;

  for (let index = 0; index < first.length; index += 1) {
    total += first[index] * second[index];
  }

  return total;
};

// Guards the index-time vs query-time parity invariant. Embeds the canonical
// sentence and confirms it still matches the checked-in reference vector; both
// are unit-normalized, so their dot product is the cosine similarity. Run this
// at the start of ingestion and at search startup so a drifted model, dtype, or
// backend fails loudly instead of quietly degrading ranking.
export const assertEmbeddingParity = async (): Promise<void> => {
  const vector = await embedText(referenceEmbedding.sentence, "document");

  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension is ${vector.length}, expected ${EMBEDDING_DIMENSIONS}.`,
    );
  }

  const similarity = dotProduct(vector, referenceEmbedding.vector);

  if (similarity < PARITY_MIN_COSINE) {
    throw new Error(
      `Embedding parity check failed: cosine ${similarity.toFixed(6)} < ${PARITY_MIN_COSINE}. The model, dtype, or backend has changed.`,
    );
  }
};

