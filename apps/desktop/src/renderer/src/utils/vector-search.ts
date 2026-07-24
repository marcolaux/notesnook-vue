import { ref } from "vue";
import { pipeline, env } from "@huggingface/transformers";
import { chunkText } from "@notesnook-vue/shared";
import { desktop } from "@/platform/desktop-bridge";
import { readSemanticSearchEnabled } from "@/stores/settings";
import type { SQLiteParameter } from "@contracts/router";

// Configure local cache & execution defaults
env.allowRemoteModels = true;

export const isIndexing = ref(false);

let extractorInstance: any = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

async function runSql<R = any>(sql: string, parameters: SQLiteParameter[] = []): Promise<R[]> {
  try {
    const result = await desktop.sqlite.run.mutate({
      id: "db",
      sql,
      parameters
    });
    return (result.rows ?? []) as R[];
  } catch {
    return [];
  }
}

async function getExtractor(): Promise<any> {
  if (extractorInstance) return extractorInstance;
  if (isInitializing && initPromise) {
    await initPromise;
    return extractorInstance;
  }

  isInitializing = true;
  initPromise = (async () => {
    try {
      extractorInstance = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        dtype: "fp32"
      });
    } catch (err) {
      console.error("[vector-search] Failed to initialize embedding pipeline:", err);
      extractorInstance = null;
    } finally {
      isInitializing = false;
    }
  })();

  await initPromise;
  return extractorInstance;
}

/**
 * Generate a 384-dimensional normalized Float32Array embedding for a given text prompt.
 */
export async function computeEmbedding(text: string): Promise<Float32Array | null> {
  if (!readSemanticSearchEnabled()) return null;
  const extractor = await getExtractor();
  if (!extractor) return null;

  try {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data);
  } catch (err) {
    console.error("[vector-search] Failed to compute embedding:", err);
    return null;
  }
}

export interface VectorSearchResult {
  noteId: string;
  chunkIndex: number;
  distance: number;
}

/**
 * Perform a KNN vector search against the local SQLite `vec_notes` table.
 */
export async function searchVectorEmbeddings(
  queryText: string,
  limit = 20
): Promise<VectorSearchResult[]> {
  if (!readSemanticSearchEnabled() || !queryText.trim()) return [];

  const queryVector = await computeEmbedding(queryText);
  if (!queryVector) return [];

  try {
    const rows = await runSql<{
      rowid: number;
      note_id: string;
      chunk_index: number;
      distance: number;
    }>(
      `SELECT rowid, note_id, chunk_index, distance 
       FROM vec_notes 
       WHERE embedding MATCH ? 
       ORDER BY distance 
       LIMIT ?`,
      [queryVector, limit]
    );

    return rows.map((row) => ({
      noteId: row.note_id,
      chunkIndex: Number(row.chunk_index),
      distance: Number(row.distance)
    }));
  } catch (err) {
    console.error("[vector-search] searchVectorEmbeddings query failed:", err);
    return [];
  }
}

let lastUserActivity = 0;
let userActivityBound = false;

/** Record active user interaction (keypress, click, pointer) to defer background indexing. */
export function recordUserActivity(): void {
  lastUserActivity = Date.now();
}

/** Check if user performed interaction within `thresholdMs` (default 5s). */
export function isUserRecentlyActive(thresholdMs = 5000): boolean {
  return Date.now() - lastUserActivity < thresholdMs;
}

/** Bind global keydown and pointerdown listeners to detect user activity. */
export function bindUserActivityListeners(): void {
  if (userActivityBound || typeof window === "undefined") return;
  userActivityBound = true;
  const handler = (): void => {
    lastUserActivity = Date.now();
  };
  window.addEventListener("keydown", handler, { passive: true });
  window.addEventListener("pointerdown", handler, { passive: true });
}

/**
 * Incrementally index a note's text content.
 * Reuses existing chunk embeddings for unchanged paragraphs to eliminate unnecessary computations.
 */
export async function indexNoteEmbeddings(noteId: string, rawContent: string): Promise<void> {
  if (!readSemanticSearchEnabled() || !noteId) return;

  const chunks = chunkText(rawContent);

  try {
    // 1. Fetch existing chunks for this note
    const existing = await runSql<{ chunk_index: number; chunk_hash: string }>(
      "SELECT chunk_index, chunk_hash FROM vec_notes WHERE note_id = ?",
      [noteId]
    );
    const existingMap = new Map<number, string>(
      existing.map((r) => [Number(r.chunk_index), r.chunk_hash])
    );

    // If total chunk count and all hashes match, note is 100% up-to-date
    const allMatch =
      existingMap.size === chunks.length &&
      chunks.every((c) => existingMap.get(c.index) === c.hash);

    if (allMatch) {
      return; // Already up-to-date
    }

    // Delete obsolete chunks if note length shortened
    if (existingMap.size > chunks.length) {
      await runSql("DELETE FROM vec_notes WHERE note_id = ? AND chunk_index >= ?", [
        noteId,
        BigInt(chunks.length)
      ]);
    }

    if (chunks.length === 0) return;

    // 2. Incremental chunk processing with interruptibility & frame yielding
    for (const chunk of chunks) {
      // Check if user is actively typing/interacting. If so, suspend indexing
      if (isUserRecentlyActive(5000)) {
        indexQueue.set(noteId, rawContent);
        return;
      }

      const existingHash = existingMap.get(chunk.index);
      if (existingHash === chunk.hash) {
        continue; // Skip unchanged chunk!
      }

      const vec = await computeEmbedding(chunk.text);
      if (!vec) continue;

      if (existingHash !== undefined) {
        await runSql(
          `UPDATE vec_notes SET chunk_hash = ?, embedding = ? WHERE note_id = ? AND chunk_index = ?`,
          [chunk.hash, vec, noteId, BigInt(chunk.index)]
        );
      } else {
        await runSql(
          `INSERT INTO vec_notes(note_id, chunk_index, chunk_hash, embedding)
           VALUES (?, ?, ?, ?)`,
          [noteId, BigInt(chunk.index), chunk.hash, vec]
        );
      }

      // Yield frame briefly to ensure main UI thread remains 100% smooth
      await new Promise((res) => setTimeout(res, 30));
    }
  } catch (err) {
    console.error(`[vector-search] indexNoteEmbeddings failed for note ${noteId}:`, err);
  }
}

const indexQueue = new Map<string, string>();
let queueTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_DELAY_MS = 10_000; // 10s delay while actively editing

/**
 * Non-blocking, debounced, activity-gated embedding queue for note edits & preview loads.
 * Guarantees active typing and UI rendering remain 100% fast, fluid, and lag-free.
 */
export function queueIndexNoteEmbeddings(noteId: string, rawContent: string): void {
  if (!readSemanticSearchEnabled() || !noteId || !rawContent) return;

  bindUserActivityListeners();
  indexQueue.set(noteId, rawContent);

  if (queueTimer) clearTimeout(queueTimer);

  queueTimer = setTimeout(() => {
    const scheduleIdle =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 500);

    scheduleIdle(async () => {
      // Defer if user typed recently
      if (isUserRecentlyActive(8000)) {
        queueIndexNoteEmbeddings(noteId, rawContent);
        return;
      }

      if (indexQueue.size === 0) return;
      isIndexing.value = true;

      const pending = Array.from(indexQueue.entries());
      indexQueue.clear();

      for (const [id, content] of pending) {
        if (isUserRecentlyActive(5000)) {
          indexQueue.set(id, content);
          break;
        }
        await indexNoteEmbeddings(id, content);
      }

      setTimeout(() => {
        isIndexing.value = false;
      }, 500);
    });
  }, DEBOUNCE_DELAY_MS);
}

/**
 * Flush any pending queued vector indexing immediately (e.g. on editor blur, tab switch, unmount).
 */
export function flushVectorIndexQueue(): void {
  if (indexQueue.size === 0) return;
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  const pending = Array.from(indexQueue.entries());
  indexQueue.clear();

  const scheduleIdle =
    typeof requestIdleCallback !== "undefined"
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 200);

  scheduleIdle(async () => {
    isIndexing.value = true;
    for (const [id, content] of pending) {
      await indexNoteEmbeddings(id, content);
    }
    setTimeout(() => {
      isIndexing.value = false;
    }, 500);
  });
}

/**
 * Delete all vector embeddings for a given note.
 */
export async function deleteNoteEmbeddings(noteId: string): Promise<void> {
  if (!noteId) return;
  try {
    await runSql("DELETE FROM vec_notes WHERE note_id = ?", [noteId]);
  } catch (err) {
    console.error(`[vector-search] deleteNoteEmbeddings failed for note ${noteId}:`, err);
  }
}

/**
 * Purge all vector search data (truncates `vec_notes` table).
 */
export async function purgeVectorIndex(): Promise<void> {
  try {
    await runSql("DELETE FROM vec_notes;", []);
  } catch (err) {
    console.error("[vector-search] purgeVectorIndex failed:", err);
  }
}
