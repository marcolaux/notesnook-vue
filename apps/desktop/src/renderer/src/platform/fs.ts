/*
FileStorage — the `@notesnook/core` `IFileStorage` implementation for desktop.
Ported from upstream `apps/web/src/interfaces/fs.ts` (GPL-3.0), trimmed to the
local-attachment path. Attachments are stored chunked + encrypted (sodium
secretstream xchacha20poly1305) via `@notesnook/streamable-fs` over a chunk
store (`NodeFSFileStore` → Main node-fs in production).

Differences from upstream (deliberate, for Phase 1):
  - Hash: SHA-256 (Web Crypto) instead of hash-wasm xxhash64 — avoids a WASM
    dep; fresh attachments are self-consistent. Reading existing Notesnook
    attachments (xxh64) is deferred to the import-DB milestone.
  - downloadFile/uploadFile (sync-server HTTP) throw "not implemented (Phase 6)"
    instead of pulling axios/file-saver/toast/etc.
  - Progress/toast/app-events UI feedback dropped (not needed for storage).

The chunk store + NNCrypto are injectable so the encryption pipeline can be
tested against an in-memory chunk store + the real sodium crypto.
*/
import { StreamableFS } from "@notesnook/streamable-fs";
import type { IFileStorage as StreamableFSChunkStore } from "@notesnook/streamable-fs";
import type {
  IFileStorage,
  Cancellable,
  SerializedKey,
  DataFormat,
  Output,
  RequestOptions,
  FileEncryptionMetadataWithOutputType,
  FileEncryptionMetadataWithHash
} from "@notesnook-vue/contracts";
import { NNCrypto } from "./nncrypto";
import { NodeFSFileStore } from "./file-store";

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

export function createFileStorage(options: FileStorageOptions = {}): IFileStorage {
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

    async deleteFile(filename, requestOptions?): Promise<boolean> {
      if (!requestOptions) {
        return !(await streamablefs.exists(filename)) || (await streamablefs.deleteFile(filename));
      }
      // Server-side delete (sync) — not implemented until Phase 6.
      throw new Error("deleteFile with requestOptions (sync) not implemented (Phase 6)");
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

    async getUploadedFileSize(_filename): Promise<number> {
      // No sync server in Phase 1 → report not uploaded.
      return 0;
    },

    async clearFileStorage(): Promise<void> {
      await streamablefs.clear();
    },

    async hashBase64(data): Promise<{ hash: string; type: string }> {
      return { hash: await sha256Hex(base64ToBytes(data)), type: "sha256" };
    },

    downloadFile(_filename, _requestOptions): Cancellable<boolean> {
      return {
        execute: async () => {
          throw new Error("downloadFile (sync) not implemented (Phase 6)");
        },
        cancel: async () => undefined
      };
    },
    uploadFile(_filename, _requestOptions): Cancellable<boolean> {
      return {
        execute: async () => {
          throw new Error("uploadFile (sync) not implemented (Phase 6)");
        },
        cancel: async () => undefined
      };
    }
  };
}