/*
FileStorage — the `@notesnook/core` `IFileStorage` implementation for desktop.
Ported from upstream `apps/web/src/interfaces/fs.ts` (GPL-3.0), trimmed to the
local-attachment path. Attachments are stored chunked + encrypted (sodium
secretstream xchacha20poly1305) via `@notesnook/streamable-fs` over a chunk
store (`NodeFSFileStore` → Main node-fs in production).

Differences from upstream (deliberate, for Phase 1):
  - Hash: SHA-256 (Web Crypto) instead of hash-wasm xxhash64 — avoids a WASM
    dep; fresh attachments are self-consistent. The hash is an opaque storage
    key on both client and server, and downloads use the hash from synced
    attachment metadata (never recomputed), so cross-app sync with upstream
    (xxh64) works regardless — only cross-client dedup is affected.
  - HTTP transfers use the renderer `fetch` API instead of `axios` (not a
    dependency here). The protocol matches upstream's `apps/web/src/interfaces/
    fs.ts` exactly: single-part PUT for <25MB, S3 multipart for larger, GET a
    pre-signed URL then fetch for downloads, HEAD for size verification.
  - Multipart upload runs parts sequentially (upstream uses a 4-wide queue) and
    omits the per-part resume-state persistence (`addAdditionalData`); a failed
    large upload retries from zero. The top-of-`uploadFile` size check still
    skips already-uploaded files, so completed uploads are never re-sent.
  - Progress/toast/app-events UI feedback dropped (not needed for storage).

The chunk store + NNCrypto are injectable so the encryption pipeline can be
tested against an in-memory chunk store + the real sodium crypto.
*/
import { StreamableFS } from "@notesnook/streamable-fs";
import type { IFileStorage as StreamableFSChunkStore, FileHandle } from "@notesnook/streamable-fs";
import type {
  IFileStorage,
  Cancellable,
  SerializedKey,
  DataFormat,
  Output,
  RequestOptions,
  FileEncryptionMetadataWithOutputType,
  FileEncryptionMetadataWithHash,
  Database
} from "@notesnook-vue/contracts";
import { hosts } from "@notesnook-vue/contracts";
import { NNCrypto } from "./nncrypto";
import { NodeFSFileStore } from "./file-store";

// Lazy accessor for the active per-account `Database`. The `FileStorage` is
// constructed (and passed to `db.setup`) before the `Database` exists, so this
// can't be a construction-time dependency — it is resolved lazily inside the
// sync transfer methods (which only run during sync, long after bootstrap).
// The import forms a benign cycle (bootstrap → database → fs → bootstrap):
// `getDatabase` is a hoisted function declaration, and we only *call* it at
// runtime, so the live binding is resolved by then. Mirrors the pattern in
// `editor/attachments-bridge.ts`.
import { getDatabase } from "@/platform/bootstrap";

const ABYTES = 17;
const CHUNK_SIZE = 512 * 1024;
const ALG = "xcha-stream";

type Chunk = { data: Uint8Array; final: boolean };
type NNCryptoLike = typeof NNCrypto;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function bytesToHex(bytes: Uint8Array): string {
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return h;
}
function concatBytes(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const out: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) out.push(value);
  }
  return out;
}

export interface FileStorageOptions {
  chunkStore?: StreamableFSChunkStore;
  crypto?: NNCryptoLike;
}

/** Desktop-only extension to `IFileStorage`: raw encrypted-byte read/write used
 *  by the auto-backup scheduler + restore. Backup stores the encrypted blob
 *  verbatim (plus the `.attachments_key` core yields) — `readEncrypted` would
 *  DECRYPT, which is wrong for backup. These expose the underlying `streamablefs`
 *  `readable`/`writeable` streams (the encrypted bytes) without touching core's
 *  `IFileStorage` type. */
export interface DesktopFileStorage extends IFileStorage {
  /** Open a raw encrypted-byte read stream for `filename`, or `undefined` when
   *  the file isn't cached locally. The scheduler buffers + writes this to
   *  disk as `attachments/<hash>` for a full-mode backup. */
  __rawReadStream(filename: string): Promise<ReadableStream<Uint8Array> | undefined>;
  /** Write raw encrypted bytes for `filename` back into the local chunk store
   *  (restore path). `opts` carries the attachment's plaintext `size`, `mimeType`,
   *  and `chunkSize` (from the restored `Attachment` record) so the bytes are
   *  re-chunked into `chunkSize + ABYTES` pieces exactly as `downloadFile` would
   *  lay them down. Idempotent: a complete existing file is left as-is. Returns
   *  `false` only if the write fails (never throws). */
  __rawWriteBytes(
    filename: string,
    bytes: Uint8Array,
    opts: { size: number; mimeType: string; chunkSize: number }
  ): Promise<boolean>;
}

export function createFileStorage(options: FileStorageOptions = {}): DesktopFileStorage {
  const chunkStore = options.chunkStore ?? new NodeFSFileStore();
  const nn = options.crypto ?? NNCrypto;
  const streamablefs = new StreamableFS(chunkStore);

  async function writeEncryptedBytes(
    bytes: Uint8Array,
    key: SerializedKey,
    hash: string,
    mimeType: string
  ): Promise<{ chunkSize: number; iv: string; size: number; salt: string; alg: string }> {
    if (await streamablefs.exists(hash)) await streamablefs.deleteFile(hash);
    const fileHandle = await streamablefs.createFile(hash, bytes.length, mimeType);
    const { iv, stream } = await nn.createEncryptionStream(key);
    const chunked = new ReadableStream<Chunk>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
          const end = Math.min(offset + CHUNK_SIZE, bytes.length);
          controller.enqueue({ data: bytes.subarray(offset, end), final: end >= bytes.length });
        }
        controller.close();
      }
    });
    await chunked.pipeThrough(stream).pipeTo(fileHandle.writeable);
    return { chunkSize: CHUNK_SIZE, iv, size: bytes.length, salt: key.salt ?? "", alg: ALG };
  }

  // --- Sync-server transfers (upload / download / delete / size) -----------
  // Ported from upstream `apps/web/src/interfaces/fs.ts` (GPL-3.0), retargeted
  // to the renderer `fetch` API (no `axios` here) and trimmed of progress/toast
  // UI. The encrypted blob is moved as-is; decryption stays a separate
  // `readEncrypted` step, so the wire format is byte-identical to upstream and
  // blobs round-trip across apps on the same account.

  /** Threshold above which uploads use S3 multipart instead of a single PUT. */
  const MINIMUM_MULTIPART_FILE_SIZE = 25 * 1024 * 1024;
  /** Encrypted bytes per chunk = plaintext CHUNK_SIZE + 17-byte auth tag. */
  const ENCRYPTED_CHUNK_SIZE = CHUNK_SIZE + ABYTES;
  /** Number of encrypted chunks grouped into one S3 multipart part (~10MB). */
  const UPLOAD_PART_REQUIRED_CHUNKS = Math.ceil((10 * 1024 * 1024) / ENCRYPTED_CHUNK_SIZE);

  /** `RequestOptions` plus the `AbortSignal` the `Cancellable` wrapper injects.
   *  `signal` is required (not optional) so it satisfies `fetch`'s
   *  `RequestInit.signal: AbortSignal | null` under `exactOptionalPropertyTypes`. */
  type RequestOptionsWithSignal = RequestOptions & { signal: AbortSignal };

  /** A FileHandle is "complete" when its stored encrypted bytes minus the
   *  per-chunk auth tags equal the recorded plaintext size — i.e. no chunk is
   *  missing/truncated. Mirrors upstream `exists(handle)`. */
  async function handleIsComplete(handle: FileHandle): Promise<boolean> {
    return handle.file.size === (await handle.size()) - handle.chunks.length * ABYTES;
  }

  /** `TransformStream` that re-chunks an incoming byte stream into fixed
   *  `size`-byte pieces (the last is shorter). Buffer-free (pure `Uint8Array`,
   *  no Node `Buffer`) so it runs in the renderer. Used by `downloadFile` to
   *  split the downloaded encrypted blob into `chunkSize + ABYTES` chunks the
   *  chunk store writes one-by-one. Mirrors upstream `ChunkedStream` (copy). */
  function chunkedStream(size: number): TransformStream<Uint8Array, Uint8Array> {
    let back: Uint8Array | null = null;
    return new TransformStream<Uint8Array, Uint8Array>({
      transform(part, controller) {
        back = back ? concatBytes([back, part]) : part;
        while (back.length >= size) {
          controller.enqueue(back.subarray(0, size));
          back = back.subarray(size);
        }
      },
      flush(controller) {
        if (back && back.length > 0) controller.enqueue(back);
      }
    });
  }

  /** HEAD the server for the stored (encrypted) size of `filename`.
   *  Returns `-1` on error, `0` if absent/empty, else the encrypted byte count.
   *  Mirrors upstream `getUploadedFileSize`. */
  async function getUploadedFileSizeImpl(filename: string): Promise<number> {
    try {
      const db = getDatabase();
      const token = await db.tokenManager.getAccessToken();
      const res = await fetch(`${hosts.API_HOST}/s3?name=${filename}`, {
        method: "HEAD",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) return 0;
      const len = parseInt(res.headers.get("x-object-size") ?? res.headers.get("content-length") ?? "0");
      return isNaN(len) ? 0 : len;
    } catch {
      return -1;
    }
  }

  /** Verify the just-uploaded encrypted size decrypts to `expectedSize`.
   *  Throws on mismatch. Mirrors upstream `checkUpload`. */
  async function checkUpload(filename: string, chunkSize: number, expectedSize: number): Promise<void> {
    const size = await getUploadedFileSizeImpl(filename);
    const totalChunks = Math.ceil(size / (chunkSize + ABYTES));
    const decryptedLength = size - totalChunks * ABYTES;
    const error =
      size === 0
        ? "File size is 0."
        : size === -1
          ? "File verification check failed."
          : expectedSize !== decryptedLength
            ? `File size mismatch. Expected ${expectedSize} bytes but got ${decryptedLength} bytes.`
            : undefined;
    if (error) throw new Error(error);
  }

  /** Single-part PUT: send the whole encrypted blob to `${API_HOST}/s3?name=`.
   *  Used for files < 25MB (all images). The body is sent as an `ArrayBuffer`
   *  (not a `Blob`) so `fetch` reliably sets `Content-Length` — the server treats
   *  `Content-Length: 0` as "no body" and returns a pre-signed URL string
   *  instead of storing the blob, which would look like a 200 success while
   *  nothing reaches S3. `Content-Type: ""` matches upstream (the API server
   *  proxies to a pre-signed S3 URL whose signature excludes Content-Type). */
  async function singlePartUpload(
    handle: FileHandle,
    requestOptions: RequestOptionsWithSignal
  ): Promise<boolean> {
    const { url, headers, signal } = requestOptions;
    const blob = await handle.toBlob();
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "" },
      body: await blob.arrayBuffer(),
      signal
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[fs] singlePartUpload failed: ${res.status} ${res.statusText} for ${url}; body=`,
        (await res.text()).slice(0, 300)
      );
      return false;
    }
    return true;
  }

  /** S3 multipart upload for files >= 25MB: initiate → PUT each part to its
   *  pre-signed URL → complete. Parts run sequentially (upstream uses a 4-wide
   *  queue; sequential is correct and avoids an extra dep). Resume-state
   *  persistence is omitted — a failed upload retries from zero, and the
   *  top-of-`uploadFile` size check still skips already-completed files. */
  async function multiPartUpload(
    handle: FileHandle,
    filename: string,
    requestOptions: RequestOptionsWithSignal
  ): Promise<boolean> {
    const { headers, signal } = requestOptions;
    const totalParts = Math.ceil(handle.chunks.length / UPLOAD_PART_REQUIRED_CHUNKS);

    const initiateRes = await fetch(
      `${hosts.API_HOST}/s3/multipart?name=${filename}&parts=${totalParts}&uploadId=`,
      { headers, signal }
    );
    if (!initiateRes.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[fs] multipart initiate failed: ${initiateRes.status} ${initiateRes.statusText}; body=`,
        (await initiateRes.text()).slice(0, 300)
      );
      throw new Error("Could not initiate multi-part upload.");
    }
    const initiated = (await initiateRes.json()) as { uploadId: string; parts: string[]; error?: string };
    if (initiated.error) throw new Error(initiated.error);
    const { uploadId, parts } = initiated;
    if (!parts) throw new Error("Could not initiate multi-part upload: invalid response.");

    const partETags: { PartNumber: number; ETag: string }[] = [];
    for (let i = 0; i < totalParts; ++i) {
      const from = i * UPLOAD_PART_REQUIRED_CHUNKS;
      const length = Math.min(handle.chunks.length - from, UPLOAD_PART_REQUIRED_CHUNKS);
      const partUrl = parts[i];
      if (!partUrl) throw new Error(`Missing pre-signed URL for part ${i}.`);
      const blob = await handle.readChunks(from, length);
      const res = await fetch(partUrl, {
        method: "PUT",
        // Pre-signed S3 part URL — signature excludes Content-Type, so send "".
        // ArrayBuffer body → reliable Content-Length (see singlePartUpload).
        headers: { "Content-Type": "" },
        body: await blob.arrayBuffer(),
        signal
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error(
          `[fs] multipart part ${i} failed: ${res.status} ${res.statusText}; body=`,
          (await res.text()).slice(0, 300)
        );
        throw new Error(`Failed to upload part ${i}: ${res.status}`);
      }
      const etag = res.headers.get("etag");
      if (!etag) throw new Error(`Failed to upload part ${i}: invalid etag.`);
      partETags.push({ PartNumber: i + 1, ETag: JSON.parse(etag) });
    }

    const completeRes = await fetch(`${hosts.API_HOST}/s3/multipart`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        Key: filename,
        UploadId: uploadId,
        PartETags: partETags.sort((a, b) => a.PartNumber - b.PartNumber)
      }),
      signal
    });
    if (!completeRes.ok) throw new Error("Could not complete multi-part upload.");
    return true;
  }

  /** Upload one encrypted blob to the sync server. Returns `true` on success,
   *  `false` on failure (never throws — core's `queueUploads` logs the error
   *  and marks the attachment failed). Mirrors upstream `uploadFile`. */
  async function uploadFileImpl(
    filename: string,
    requestOptions: RequestOptionsWithSignal
  ): Promise<boolean> {
    try {
      const handle = await streamablefs.readFile(filename);
      if (!handle || !(await handleIsComplete(handle)))
        throw new Error(`File is corrupt or missing data. Please upload the file again. (File hash: ${filename})`);

      // Skip if already on the server (encrypted sizes match).
      const uploadedSize = await getUploadedFileSizeImpl(filename);
      if (uploadedSize === -1) return false;
      if (uploadedSize > 0 && uploadedSize === (await handle.size())) return true;

      const multipart = handle.file.size >= MINIMUM_MULTIPART_FILE_SIZE;
      const uploaded = multipart
        ? await multiPartUpload(handle, filename, requestOptions)
        : await singlePartUpload(handle, requestOptions);

      if (uploaded) await checkUpload(filename, requestOptions.chunkSize, handle.file.size);
      if (!uploaded) {
        // eslint-disable-next-line no-console
        console.warn(`[fs] upload reported failure for ${filename} (see error above)`);
      }
      return uploaded;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[fs] uploadFile failed:", e);
      return false;
    }
  }

  /** Download one encrypted blob from the sync server into the local chunk
   *  store. The server's `/s3?name=` GET returns a pre-signed URL (text); a
   *  second `fetch` streams the encrypted bytes, which are re-chunked into
   *  `chunkSize + ABYTES` pieces and written under `filename`. Validates the
   *  decrypted length against the attachment record and marks the attachment
   *  failed on mismatch. Mirrors upstream `downloadFile`. */
  async function downloadFileImpl(
    filename: string,
    requestOptions: RequestOptionsWithSignal
  ): Promise<boolean> {
    const { url, headers, chunkSize, signal } = requestOptions;
    try {
      const existing = await streamablefs.readFile(filename);
      if (existing && (await handleIsComplete(existing))) return true;
      if (existing) await existing.delete();

      const db = getDatabase();
      const attachment = await db.attachments.attachment(filename);
      if (!attachment) throw new Error("Attachment doesn't exist.");

      // 1. Get a pre-signed URL (the API GET returns it as text).
      const signedRes = await fetch(url, { headers, signal });
      if (signedRes.status === 401) {
        // eslint-disable-next-line no-console
        console.warn(`[fs] download: signed-URL GET returned 401 for ${filename}`);
        return false;
      }
      if (!signedRes.ok) {
        // eslint-disable-next-line no-console
        console.error(
          `[fs] download: signed-URL GET failed: ${signedRes.status} ${signedRes.statusText} for ${filename}; body=`,
          (await signedRes.text()).slice(0, 300)
        );
        throw new Error(`Failed to get signed URL (${signedRes.status}).`);
      }
      const signedUrl = (await signedRes.text()).trim();
      if (!signedUrl || !signedUrl.startsWith("http")) {
        // eslint-disable-next-line no-console
        console.error(`[fs] download: invalid signed URL for ${filename}:`, signedUrl.slice(0, 200));
        throw new Error("Empty signed URL.");
      }

      // 2. Stream the encrypted blob.
      const res = await fetch(signedUrl, { signal });
      if (!res.ok || !res.body) {
        // eslint-disable-next-line no-console
        console.error(`[fs] download: blob fetch failed: ${res.status} ${res.statusText} for ${filename}`);
        throw new Error(`Download failed (${res.status}).`);
      }

      const size = parseInt(res.headers.get("content-length") ?? "0");
      if (size <= 0) {
        const error = `File length is 0. Please upload this file again from the attachment manager. (File hash: ${filename})`;
        await db.attachments.markAsFailed(attachment.id, error);
        throw new Error(error);
      }
      const totalChunks = Math.ceil(size / (chunkSize + ABYTES));
      const decryptedLength = size - totalChunks * ABYTES;
      if (attachment.size !== decryptedLength) {
        const error = `File length mismatch. Expected ${attachment.size} but got ${decryptedLength} bytes. Please upload this file again from the attachment manager. (File hash: ${filename})`;
        await db.attachments.markAsFailed(attachment.id, error);
        throw new Error(error);
      }
      if (res.headers.get("content-type") === "application/xml") {
        throw new Error(`Download returned an XML error: ${await res.text()}`);
      }

      // 3. Re-chunk + write to the chunk store under `filename`.
      const fileHandle = await streamablefs.createFile(
        filename,
        decryptedLength,
        attachment.mimeType || "application/octet-stream",
        { overwrite: true }
      );
      await res.body.pipeThrough(chunkedStream(chunkSize + ABYTES)).pipeTo(fileHandle.writeable);
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[fs] downloadFile failed:", e);
      // Clean up a partial download so the next attempt re-fetches.
      try {
        const partial = await streamablefs.readFile(filename);
        if (partial) await partial.delete();
      } catch {
        // ignore cleanup failure
      }
      return false;
    }
  }

  return {
    async writeEncryptedBase64(data, key, mimeType): Promise<FileEncryptionMetadataWithHash> {
      const bytes = base64ToBytes(data);
      const hash = await sha256Hex(bytes);
      const result = await writeEncryptedBytes(bytes, key, hash, mimeType || "application/octet-stream");
      return { ...result, hash, hashType: "sha256" };
    },

    readEncrypted: async <TOutputFormat extends DataFormat>(
      filename: string,
      key: SerializedKey,
      cipherData: FileEncryptionMetadataWithOutputType<TOutputFormat>
    ): Promise<Output<TOutputFormat> | undefined> => {
      const fileHandle = await streamablefs.readFile(filename);
      if (!fileHandle) return undefined;
      const decStream = await nn.createDecryptionStream(key, cipherData.iv);
      const chunks = await consumeStream(fileHandle.readable.pipeThrough(decStream));
      const out = concatBytes(chunks);
      if (cipherData.outputType === "base64") return bytesToBase64(out) as Output<TOutputFormat>;
      if (cipherData.outputType === "text") return new TextDecoder().decode(out) as Output<TOutputFormat>;
      return out as Output<TOutputFormat>;
    },

    /** Raw encrypted-byte read stream (desktop-only; see {@link DesktopFileStorage}).
     *  Used by the auto-backup scheduler to copy cached attachment blobs to disk
     *  verbatim for a full-mode backup. Returns `undefined` when the file isn't
     *  cached locally — the scheduler skips it (mirrors core's own skip when
     *  `downloadFile` can't fetch a signed URL offline). */
    async __rawReadStream(filename): Promise<ReadableStream<Uint8Array> | undefined> {
      const handle = await streamablefs.readFile(filename);
      return handle?.readable;
    },

    /** Raw encrypted-byte write (desktop-only; see {@link DesktopFileStorage}).
     *  Used by the restore flow to put a backed-up encrypted blob back into the
     *  local chunk store so the attachment opens offline without a sync-server
     *  round-trip. Mirrors `downloadFileImpl`'s write step: re-chunk the bytes
     *  into `chunkSize + ABYTES` pieces and pipe to `fileHandle.writeable`. Do NOT
     *  use `ReadableStream.from(bytes)` — it iterates a `Uint8Array` byte-by-byte
     *  as numbers and breaks `chunkedStream`; the explicit constructor enqueues the
     *  whole blob as one `Uint8Array` chunk. Idempotent: a complete existing file
     *  is left untouched. */
    async __rawWriteBytes(filename, bytes, opts): Promise<boolean> {
      try {
        const existing = await streamablefs.readFile(filename);
        if (existing && (await handleIsComplete(existing))) return true;
        if (existing) await existing.delete();
        const fileHandle = await streamablefs.createFile(
          filename,
          opts.size,
          opts.mimeType || "application/octet-stream",
          { overwrite: true }
        );
        await new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          }
        })
          .pipeThrough(chunkedStream(opts.chunkSize + ABYTES))
          .pipeTo(fileHandle.writeable);
        return true;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[fs] __rawWriteBytes failed:", e);
        return false;
      }
    },

    async deleteFile(filename, requestOptions?): Promise<boolean> {
      if (!requestOptions) {
        return !(await streamablefs.exists(filename)) || (await streamablefs.deleteFile(filename));
      }
      try {
        const { url, headers } = requestOptions;
        const res = await fetch(url, { method: "DELETE", headers });
        if (res.ok) await streamablefs.deleteFile(filename);
        return res.ok;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[fs] deleteFile failed:", e);
        return false;
      }
    },

    async bulkDeleteFiles(filenames, requestOptions?): Promise<boolean> {
      if (!requestOptions) {
        // Local bulk delete: best-effort, returns true if every file was removed.
        let all = true;
        for (const f of filenames) {
          try {
            if ((await streamablefs.exists(f)) && !(await streamablefs.deleteFile(f))) all = false;
          } catch {
            all = false;
          }
        }
        return all;
      }
      try {
        const { url, headers } = requestOptions;
        const res = await fetch(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ names: filenames })
        });
        if (res.ok) await streamablefs.bulkDeleteFiles(filenames);
        return res.ok;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[fs] bulkDeleteFiles failed:", e);
        return false;
      }
    },

    async exists(filename): Promise<boolean> {
      const h = await streamablefs.readFile(filename);
      return !!h && h.file.size === (await h.size()) - h.chunks.length * ABYTES;
    },

    async bulkExists(filenames): Promise<string[]> {
      const files = (await streamablefs.list()).map((c) => c.replace(/-chunk-\d+/, ""));
      const set = new Set(files);
      return filenames.filter((f) => !set.has(f));
    },

    async getUploadedFileSize(filename): Promise<number> {
      return getUploadedFileSizeImpl(filename);
    },

    async clearFileStorage(): Promise<void> {
      await streamablefs.clear();
    },

    async hashBase64(data): Promise<{ hash: string; type: string }> {
      return { hash: await sha256Hex(base64ToBytes(data)), type: "sha256" };
    },

    downloadFile(filename, requestOptions): Cancellable<boolean> {
      const controller = new AbortController();
      return {
        execute: () => downloadFileImpl(filename, { ...requestOptions, signal: controller.signal }),
        cancel: async () => controller.abort()
      };
    },
    uploadFile(filename, requestOptions): Cancellable<boolean> {
      const controller = new AbortController();
      return {
        execute: () => uploadFileImpl(filename, { ...requestOptions, signal: controller.signal }),
        cancel: async () => controller.abort()
      };
    }
  };
}

// --- Auto-backup scheduler + restore: raw encrypted attachment read/write ---
//
// The per-account auto-backup scheduler (`stores/auto-backup.ts`) copies each
// cached attachment's ENCRYPTED bytes to disk verbatim for a full-mode backup,
// and the restore flow (`stores/backup.ts`) writes them back into the local
// chunk store. Backup stores the encrypted blob + the `.attachments_key` core
// yields, NOT the decrypted plaintext.
//
// IMPORTANT: `db.fs()` returns core's `FileStorage` WRAPPER (constructed in
// `Database.fs()` at `vendor/.../core/src/api/index.ts`), which exposes only the
// standard `IFileStorage` methods — NOT `__rawReadStream`/`__rawWriteBytes` or
// the underlying desktop impl. So reaching them through `db.fs()` is a no-op
// (the property is `undefined` and every attachment would be silently skipped).
// The local chunk store is GLOBAL (`userData/attachments/`, shared across every
// context — see `main/file-storage.ts`), so a single `DesktopFileStorage`
// instance reads/writes any context's cached blobs. We keep one lazily here and
// bypass the wrapper entirely.

let rawFileStorage: DesktopFileStorage | undefined;
function getRawFileStorage(): DesktopFileStorage {
  if (!rawFileStorage) rawFileStorage = createFileStorage();
  return rawFileStorage;
}

/** Open a raw encrypted-byte read stream for `hash` from the global local chunk
 *  store, or `undefined` when the file isn't cached locally. Never throws — a
 *  failure logs + returns `undefined` so the scheduler can skip the attachment
 *  (mirrors core's own skip at `backup.ts` when `downloadFile` can't fetch a
 *  signed URL offline). */
export async function readAttachmentStream(
  hash: string
): Promise<ReadableStream<Uint8Array> | undefined> {
  try {
    return await getRawFileStorage().__rawReadStream(hash);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[fs] readAttachmentStream failed:", e);
    return undefined;
  }
}

/** Write a backed-up encrypted blob back into the local chunk store so the
 *  attachment opens offline after a restore (core's `db.backup.import` restores
 *  only the metadata + per-attachment key; the blob write is the app's job).
 *  Looks up the restored `Attachment` record for `size`/`mimeType`/`chunkSize`,
 *  then re-chunks + pipes the bytes via `__rawWriteBytes`. Never throws — a
 *  failure logs + returns `false` (the attachment stays not-uploaded so sync
 *  re-fetches it). */
export async function writeAttachmentBytes(
  db: Database,
  hash: string,
  bytes: Uint8Array
): Promise<boolean> {
  try {
    const attachment = await db.attachments.attachment(hash);
    if (!attachment) return false;
    return await getRawFileStorage().__rawWriteBytes(hash, bytes, {
      size: attachment.size,
      mimeType: attachment.mimeType,
      chunkSize: attachment.chunkSize
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[fs] writeAttachmentBytes failed:", e);
    return false;
  }
}