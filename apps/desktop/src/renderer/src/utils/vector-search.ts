import { ref } from "vue";
import { chunkText } from "@notesnook-vue/shared";
import { desktop } from "@/platform/desktop-bridge";
import { getCurrentContext } from "@/platform/bootstrap";
import { dbFileName } from "@/platform/account-context";
import { readSemanticSearchEnabled } from "@/stores/settings";
import { embed } from "@/utils/worker-embedding-client";
import type { SQLiteParameter } from "@contracts/router";
import { logger } from "./logger";

export const isIndexing = ref(false);

/**
 * The active account's SQLite handle id. Main's `databases` map is keyed by the
 * `filePath` passed to `sqlite.open` — the per-account DB filename
 * `notesnook-<contextId>` (see `account-context.ts` `dbFileName`). The vec0
 * `vec_notes` virtual table is created in THAT db on open (main `sqlite.ts`
 * `loadExtensions`). So vector-search MUST target the active context's handle,
 * not a hardcoded `"db"` (which is never registered → "Database not found for
 * id: db" on every call → writes never persist → notes re-queue on every sync
 * reload → a runaway indexing loop). Resolved at call time so an account switch
 * (login swap) retargets to the new context's db automatically.
 */
function vectorDbId(): string {
  return dbFileName(getCurrentContext());
}

async function runSql<R = any>(sql: string, parameters: SQLiteParameter[] = []): Promise<R[]> {
  try {
    const result = await desktop.sqlite.run.mutate({
      id: vectorDbId(),
      sql,
      parameters
    });
    return (result.rows ?? []) as R[];
  } catch {
    return [];
  }
}

/**
 * Run multiple write statements in a single transactional IPC round-trip
 * (`sqlite.runBatch` → main `db.transaction(BEGIN…COMMIT)`). Replaces the
 * per-chunk `runSql` writes inside `indexNoteEmbeddings` so an N-chunk re-index
 * costs one IPC hop + one WAL fsync instead of N (Phase B). Errors are logged
 * and swallowed to match `runSql`'s resilient-by-default contract.
 */
async function runSqlBatch(
  statements: { sql: string; parameters: SQLiteParameter[] }[]
): Promise<void> {
  if (statements.length === 0) return;
  logger.log("[vector-search] runSqlBatch flushing", { statements: statements.length });
  try {
    await desktop.sqlite.runBatch.mutate({ id: vectorDbId(), statements });
  } catch (err) {
    logger.error("[vector-search] runSqlBatch failed:", err);
  }
}

/**
 * Generate a 384-dimensional normalized Float32Array embedding for a given text prompt.
 *
 * Inference runs in a dedicated Web Worker (`vector-search.worker.ts` via the
 * `worker-embedding-client`), so the ONNX pipeline never blocks the renderer
 * main thread — including the un-gated per-keystroke query-time path. The
 * worker is lazily constructed on first use; if it is unavailable, this
 * resolves to `null` (callers skip the chunk / fall back to lexical search).
 */
export async function computeEmbedding(text: string): Promise<Float32Array | null> {
  if (!readSemanticSearchEnabled(getCurrentContext())) return null;
  return embed(text);
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
  if (!readSemanticSearchEnabled(getCurrentContext()) || !queryText.trim()) return [];

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
    logger.error("[vector-search] searchVectorEmbeddings query failed:", err);
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
 * Accepts optional note title to enrich chunk 0 with metadata context.
 */
export async function indexNoteEmbeddings(
  noteId: string,
  rawContent: string,
  title?: string
): Promise<void> {
  if (!readSemanticSearchEnabled(getCurrentContext()) || !noteId) return;

  const fullText = title && title.trim() ? `${title.trim()}\n\n${rawContent}` : rawContent;
  const chunks = chunkText(fullText);

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

    logger.log("[vector-search] indexNoteEmbeddings", {
      noteId,
      chunks: chunks.length,
      existing: existingMap.size
    });

    // Collect all write statements for a single transactional flush (Phase B):
    // one IPC round-trip + one WAL fsync instead of N per-chunk writes.
    const statements: { sql: string; parameters: SQLiteParameter[] }[] = [];

    // Delete obsolete chunks if note length shortened. Runs first in the batch;
    // it targets chunk_index >= chunks.length while the loop below targets
    // chunk_index < chunks.length, so the two never overlap.
    if (existingMap.size > chunks.length) {
      statements.push({
        sql: "DELETE FROM vec_notes WHERE note_id = ? AND chunk_index >= ?",
        parameters: [noteId, BigInt(chunks.length)]
      });
    }

    if (chunks.length === 0) {
      // Nothing to add — just flush the trailing-chunk DELETE (if any).
      await runSqlBatch(statements);
      return;
    }

    // 2. Incremental chunk processing with interruptibility & frame yielding.
    // Embeddings are still computed serially (inference runs in the Web Worker
    // from Phase A); the writes are deferred and flushed as one batch.
    for (const chunk of chunks) {
      // Check if user is actively typing/interacting. If so, suspend indexing.
      // Flush whatever was collected so far — partial progress is safe: the
      // next run's `existingMap` will match the new hashes and skip them.
      if (isUserRecentlyActive(5000)) {
        logger.log("[vector-search] indexing interrupted (user active), re-queueing", {
          noteId,
          collected: statements.length
        });
        await runSqlBatch(statements);
        indexQueue.set(noteId, { rawContent, title });
        return;
      }

      const existingHash = existingMap.get(chunk.index);
      if (existingHash === chunk.hash) {
        continue; // Skip unchanged chunk!
      }

      const vec = await computeEmbedding(chunk.text);
      if (!vec) continue;

      if (existingHash !== undefined) {
        statements.push({
          sql: `UPDATE vec_notes SET chunk_hash = ?, embedding = ? WHERE note_id = ? AND chunk_index = ?`,
          parameters: [chunk.hash, vec, noteId, BigInt(chunk.index)]
        });
      } else {
        statements.push({
          sql: `INSERT INTO vec_notes(note_id, chunk_index, chunk_hash, embedding)
                VALUES (?, ?, ?, ?)`,
          parameters: [noteId, BigInt(chunk.index), chunk.hash, vec]
        });
      }

      // Yield frame briefly to ensure main UI thread remains 100% smooth
      await new Promise((res) => setTimeout(res, 30));
    }

    // 3. Flush the collected writes as one transactional batch.
    await runSqlBatch(statements);
  } catch (err) {
    logger.error(`[vector-search] indexNoteEmbeddings failed for note ${noteId}:`, err);
  }
}

interface QueuedItem {
  rawContent: string;
  title?: string | undefined;
}

const indexQueue = new Map<string, QueuedItem>();
let queueTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_DELAY_MS = 10_000; // 10s delay while actively editing

/**
 * Non-blocking, debounced, activity-gated embedding queue for note edits & preview loads.
 * Guarantees active typing and UI rendering remain 100% fast, fluid, and lag-free.
 */
export function queueIndexNoteEmbeddings(
  noteId: string,
  rawContent: string,
  title?: string
): void {
  if (!readSemanticSearchEnabled(getCurrentContext()) || !noteId || !rawContent) return;

  bindUserActivityListeners();
  indexQueue.set(noteId, { rawContent, title });

  if (queueTimer) clearTimeout(queueTimer);

  queueTimer = setTimeout(() => {
    const scheduleIdle =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 500);

    scheduleIdle(async () => {
      // Defer if user typed recently
      if (isUserRecentlyActive(8000)) {
        queueIndexNoteEmbeddings(noteId, rawContent, title);
        return;
      }

      if (indexQueue.size === 0) return;
      isIndexing.value = true;

      const pending = Array.from(indexQueue.entries());
      indexQueue.clear();
      logger.log("[vector-search] idle drain — indexing", { notes: pending.length });

      for (const [id, item] of pending) {
        if (isUserRecentlyActive(5000)) {
          indexQueue.set(id, item);
          break;
        }
        await indexNoteEmbeddings(id, item.rawContent, item.title);
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
    for (const [id, item] of pending) {
      await indexNoteEmbeddings(id, item.rawContent, item.title);
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
    logger.error(`[vector-search] deleteNoteEmbeddings failed for note ${noteId}:`, err);
  }
}

/**
 * Purge all vector search data (truncates `vec_notes` table).
 */
export async function purgeVectorIndex(): Promise<void> {
  try {
    await runSql("DELETE FROM vec_notes;", []);
  } catch (err) {
    logger.error("[vector-search] purgeVectorIndex failed:", err);
  }
}

/**
 * Background catch-up scanner: finds unindexed notes in the database
 * and queues them for vector embedding generation during idle CPU time.
 */
export async function indexUnindexedNotes(): Promise<void> {
  if (!readSemanticSearchEnabled(getCurrentContext())) return;
  try {
    const indexedRows = await runSql<{ note_id: string }>(
      "SELECT DISTINCT note_id FROM vec_notes"
    );
    const indexedSet = new Set(indexedRows.map((r) => r.note_id));

    // Dynamic import to break any circular dependency with bootstrap platform
    const { getDatabase } = await import("@/platform/bootstrap");
    const db = getDatabase();
    const allNotes = await db.notes.all.items();
    const unindexed = allNotes.filter((n: { id: string; title: string }) => !indexedSet.has(n.id));

    if (unindexed.length === 0) return;

    for (const note of unindexed) {
      if (!readSemanticSearchEnabled(getCurrentContext())) break;
      try {
        const item = await db.content.findByNoteId(note.id);
        const data = item && typeof item.data === "string" ? item.data : "";
        if (data) {
          queueIndexNoteEmbeddings(note.id, data, note.title);
        }
      } catch {
        // Skip individual note read error
      }
    }
  } catch (err) {
    logger.error("[vector-search] indexUnindexedNotes failed:", err);
  }
}

function parseEmbedding(raw: any): Float32Array | null {
  if (!raw) return null;
  if (raw instanceof Float32Array) return raw;
  if (raw instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(raw))) {
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  }
  if (Array.isArray(raw)) {
    return new Float32Array(raw);
  }
  return null;
}

export interface NoteCentroidEmbedding {
  noteId: string;
  embedding: Float32Array;
  chunkCount: number;
}

/**
 * Retrieves all chunk embeddings stored in `vec_notes` and averages them per note
 * to return a normalized 384-dimensional centroid vector for each note.
 */
export async function getAllNoteCentroidEmbeddings(): Promise<Map<string, NoteCentroidEmbedding>> {
  if (!readSemanticSearchEnabled(getCurrentContext())) return new Map();

  try {
    const rows = await runSql<{
      note_id: string;
      chunk_index: number;
      embedding: any;
    }>("SELECT note_id, chunk_index, embedding FROM vec_notes");

    const noteChunks = new Map<string, Float32Array[]>();

    for (const row of rows) {
      if (!row.note_id || !row.embedding) continue;
      const vec = parseEmbedding(row.embedding);
      if (!vec || vec.length !== 384) continue;

      let list = noteChunks.get(row.note_id);
      if (!list) {
        list = [];
        noteChunks.set(row.note_id, list);
      }
      list.push(vec);
    }

    const centroids = new Map<string, NoteCentroidEmbedding>();

    for (const [noteId, chunks] of noteChunks.entries()) {
      const dim = 384;
      const centroid = new Float32Array(dim);

      for (const chunkVec of chunks) {
        for (let i = 0; i < dim; i++) {
          const val = chunkVec[i] ?? 0;
          centroid[i] = (centroid[i] ?? 0) + val;
        }
      }

      let normSq = 0;
      for (let i = 0; i < dim; i++) {
        const val = (centroid[i] ?? 0) / chunks.length;
        centroid[i] = val;
        normSq += val * val;
      }

      const norm = Math.sqrt(normSq);
      if (norm > 0) {
        for (let i = 0; i < dim; i++) {
          centroid[i] = (centroid[i] ?? 0) / norm;
        }
      }

      centroids.set(noteId, {
        noteId,
        embedding: centroid,
        chunkCount: chunks.length
      });
    }


    return centroids;
  } catch (err) {
    logger.error("[vector-search] getAllNoteCentroidEmbeddings failed:", err);
    return new Map();
  }
}


