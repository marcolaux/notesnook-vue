/**
 * Embedding model + inference config, shared by the Web Worker
 * (`vector-search.worker.ts`) and the renderer-side model-change migration
 * (`vector-search.ts`). Kept **dependency-free** so the worker — a pure-web
 * bundle with no access to platform/IPC code — can import it safely.
 *
 * Model: `ibm-granite/granite-embedding-97m-multilingual-r2` (April 2026),
 * exposed for transformers.js via the official `onnx-community` ONNX
 * conversion. Chosen over the older `Xenova/all-MiniLM-L6-v2` (English-only)
 * because it is multilingual (200+ languages, German enhanced), same 384-dim
 * (no `vec_notes` schema migration), and the top multilingual retrieval model
 * under 100M params (MTEB 60.3 vs e5-small 50.9).
 *
 * Architecture: ModernBERT. transformers.js gained ModernBERT support in
 * Dec 2024 (PR #1104); the app ships @huggingface/transformers v4.2.0.
 */

/** Hugging Face repo (ONNX) loaded by transformers.js on first use, then cached. */
export const EMBEDDING_MODEL_ID = "onnx-community/granite-embedding-97m-multilingual-r2-ONNX";

/**
 * int8 quantized (`model_quantized.onnx`, ~94 MB) — the WASM-default dtype and
 * the fastest on the CPU/WASM backend (quantized matmul kernels), with the
 * smallest one-time download (≈ the previous English model's size). For this
 * ModernBERT model int8 has cosine ≈ 0.955 vs the fp32 original — a slight
 * quality drop that's immaterial for ranking similar notes, and a vast
 * improvement over the English-only model for non-English text. Inference runs
 * in a Web Worker, so this never blocks typing regardless of dtype.
 */
export const EMBEDDING_DTYPE = "q8" as const;

/**
 * Granite-embedding was trained with **CLS pooling** (the first token of the
 * last hidden state), NOT mean pooling. The model card states that mean
 * pooling "measurably degrades" retrieval quality — so this MUST be `cls` even
 * though the previous (BERT) model used `mean`. Output is L2-normalized.
 */
export const EMBEDDING_POOLING = "cls" as const;