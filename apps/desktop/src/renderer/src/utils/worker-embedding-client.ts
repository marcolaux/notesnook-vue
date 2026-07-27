import { logger } from "./logger";
// Thin promise-based RPC client for the inference Web Worker.
//
// Singleton. The Worker is constructed LAZILY on the first `embed()` call —
// never at module top-level — so that Node-based imports of `vector-search.ts`
// (e.g. the vitest contract suite) do not attempt to spawn a Worker, which
// would fail outside a browser/Electron renderer.
//
// `embed(text)` posts an `{id,type:"embed",text}` request and resolves with the
// worker's `Float32Array` (transferred buffer) or `null` on failure / if the
// worker could not be constructed.

interface EmbedResponse {
  id: number;
  embedding: Float32Array | null;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, (value: Float32Array | null) => void>();

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;

  try {
    // Vite/electron-vite recognize this `new URL(..., import.meta.url)` form
    // and emit the worker as a separate module chunk in the renderer bundle.
    worker = new Worker(new URL("./vector-search.worker.ts", import.meta.url), {
      type: "module"
    });
    worker.onmessage = (event: MessageEvent<EmbedResponse>): void => {
      const { id, embedding } = event.data;
      const resolve = pending.get(id);
      if (resolve) {
        pending.delete(id);
        resolve(embedding);
      }
    };
    worker.onerror = (err): void => {
      logger.error("[vector-search] embedding worker error:", err);
      // Reject all in-flight requests so callers get null (via the try/catch
      // wrapping `embed`); mark the worker as failed so we stop retrying.
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
      workerFailed = true;
    };
    return worker;
  } catch (err) {
    logger.error("[vector-search] Failed to construct embedding worker:", err);
    workerFailed = true;
    return null;
  }
}

/**
 * Generate a 384-dimensional normalized embedding for `text` in the worker.
 * Resolves to `null` if the worker is unavailable or inference fails — callers
 * treat null as "skip this chunk / fall back to lexical search".
 */
export async function embed(text: string): Promise<Float32Array | null> {
  const w = getWorker();
  if (!w) return null;

  return new Promise<Float32Array | null>((resolve): void => {
    const id = nextId++;
    pending.set(id, resolve);
    w.postMessage({ id, type: "embed", text });
  });
}