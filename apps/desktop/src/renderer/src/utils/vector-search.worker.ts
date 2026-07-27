// Inference-only Web Worker for on-device vector search.
//
// The Electron renderer's main world has `nodeIntegration: true`, but Web
// Workers spawned from it run in a pure-web context (no Node). This worker
// therefore does ONLY embedding generation (text -> Float32Array) via
// `@huggingface/transformers`' web/wasm backend, and transfers the resulting
// buffer back. All SQL/IPC writes, queue/gating logic, and centroid math stay
// in the renderer (`vector-search.ts`) — this keeps the main thread free of the
// ONNX pipeline (notably the un-gated per-keystroke query-time inference path).
//
// Protocol:
//   in:  { id: number, type: "embed", text: string }
//   out: { id: number, embedding: Float32Array | null }  (buffer transferred)
//
// Typed via a minimal worker-scope cast so this file typechecks under the
// renderer's DOM lib without pulling in the `webworker` lib (which would
// redeclare `self`/`postMessage` and conflict with DOM).

import { pipeline, env } from "@huggingface/transformers";

// Preserve prior behavior: fetch the model from the Hugging Face Hub on first
// use and rely on the transformers.js browser Cache API for subsequent loads.
env.allowRemoteModels = true;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let extractorInstance: any = null;
let initPromise: Promise<void> | null = null;

async function getExtractor(): Promise<any> {
  if (extractorInstance) return extractorInstance;
  if (initPromise) {
    await initPromise;
    return extractorInstance;
  }

  initPromise = (async () => {
    try {
      extractorInstance = await pipeline("feature-extraction", MODEL_ID, {
        dtype: "fp32"
      });
    } catch (err) {
      console.error("[vector-search.worker] Failed to initialize embedding pipeline:", err);
      extractorInstance = null;
    }
  })();

  await initPromise;
  return extractorInstance;
}

interface EmbedRequest {
  id: number;
  type: "embed";
  text: string;
}

interface EmbedResponse {
  id: number;
  embedding: Float32Array | null;
}

interface WorkerScope {
  onmessage: ((ev: MessageEvent<EmbedRequest>) => void) | null;
  postMessage(message: EmbedResponse, transfer: Transferable[]): void;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = async (event: MessageEvent<EmbedRequest>): Promise<void> => {
  const { id, text } = event.data;
  if (event.data?.type !== "embed") return;

  try {
    const extractor = await getExtractor();
    if (!extractor) {
      ctx.postMessage({ id, embedding: null }, []);
      return;
    }

    const output = await extractor(text, { pooling: "mean", normalize: true });
    const embedding = new Float32Array(output.data);

    // Transfer the underlying buffer (zero-copy) — it is neutered on the
    // worker side after this call, which is fine since we don't reuse it.
    ctx.postMessage({ id, embedding }, [embedding.buffer]);
  } catch (err) {
    console.error("[vector-search.worker] computeEmbedding failed:", err);
    ctx.postMessage({ id, embedding: null }, []);
  }
};