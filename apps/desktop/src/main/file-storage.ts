/**
 * Main-process file storage — a node-fs chunk store backing
 * `@notesnook/streamable-fs` for attachments. Exposed over the tRPC bridge as
 * `fs.*`. Files live under `userData/attachments/`: metadata as `<name>.meta.json`
 * and chunks as binary `<name>` files (streamable-fs names chunks `<hash>-chunk-N`).
 *
 * Names are restricted to `[A-Za-z0-9_-]+` (hashes + chunk suffixes) to prevent
 * path traversal. This is the desktop counterpart to upstream's
 * `IndexedDBFileStore`/`OriginPrivateFileSystem` (which use browser storage).
 */
import { app } from "electron";
import path from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { registerFileStorageServer } from "../contracts/router";
import type { FileStorageServer, FSFile } from "../contracts/router";

const META_SUFFIX = ".meta.json";
const NAME_RE = /^[A-Za-z0-9_-]+$/;

function attachmentsDir(): string {
  return path.join(app.getPath("userData"), "attachments");
}

function safeName(name: string): string {
  if (!NAME_RE.test(name)) throw new Error(`Invalid attachment name: ${name}`);
  return name;
}

function ensureDir(): void {
  mkdirSync(attachmentsDir(), { recursive: true });
}

function metaPath(name: string): string {
  return path.join(attachmentsDir(), safeName(name) + META_SUFFIX);
}

function chunkPath(name: string): string {
  return path.join(attachmentsDir(), safeName(name));
}

export const fileStorageServer: FileStorageServer = {
  async clear(): Promise<void> {
    if (!existsSync(attachmentsDir())) return;
    rmSync(attachmentsDir(), { recursive: true, force: true });
  },

  async setMetadata(filename, metadata): Promise<void> {
    ensureDir();
    writeFileSync(metaPath(filename), JSON.stringify(metadata));
  },

  async getMetadata(filename): Promise<FSFile | undefined> {
    const p = metaPath(filename);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf-8")) as FSFile;
  },

  async deleteMetadata(filename): Promise<void> {
    const p = metaPath(filename);
    if (existsSync(p)) unlinkSync(p);
  },

  async writeChunk(chunkName, data): Promise<void> {
    ensureDir();
    writeFileSync(chunkPath(chunkName), data);
  },

  async deleteChunk(chunkName): Promise<void> {
    const p = chunkPath(chunkName);
    if (existsSync(p)) unlinkSync(p);
  },

  async readChunk(chunkName): Promise<Uint8Array | undefined> {
    const p = chunkPath(chunkName);
    if (!existsSync(p)) return undefined;
    return new Uint8Array(readFileSync(p));
  },

  async chunkSize(chunkName): Promise<number> {
    const p = chunkPath(chunkName);
    if (!existsSync(p)) return 0;
    return statSync(p).size;
  },

  async listChunks(chunkPrefix): Promise<string[]> {
    if (!existsSync(attachmentsDir())) return [];
    return readdirSync(attachmentsDir())
      .filter((f) => !f.endsWith(META_SUFFIX) && f.startsWith(chunkPrefix));
  },

  async list(): Promise<string[]> {
    if (!existsSync(attachmentsDir())) return [];
    return readdirSync(attachmentsDir())
      .filter((f) => f.endsWith(META_SUFFIX))
      .map((f) => f.slice(0, -META_SUFFIX.length));
  }
};

export function registerFileStorage(): void {
  registerFileStorageServer(fileStorageServer);
}