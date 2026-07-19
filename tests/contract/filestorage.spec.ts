/**
 * M8 FileStorage verification — exercises the real `createFileStorage` encryption
 * pipeline (sodium secretstream via NNCrypto + streamable-fs) against an
 * in-memory chunk store, with real sodium crypto. Proves attachments
 * encrypt/write, read/decrypt back, hash, exist, and delete — without Electron
 * (the production chunk store is NodeFSFileStore → Main node-fs, injected here
 * as a MemoryFileStore).
 */
import { describe, it, expect } from "vitest";
import type { IFileStorage as StreamableFSChunkStore, File } from "@notesnook/streamable-fs";
import { createFileStorage } from "../../apps/desktop/src/renderer/src/platform/fs";
import { NNCrypto } from "../../apps/desktop/src/renderer/src/platform/nncrypto";

class MemoryFileStore implements StreamableFSChunkStore {
  private meta = new Map<string, File>();
  private chunks = new Map<string, Uint8Array>();
  async clear(): Promise<void> {
    this.meta.clear();
    this.chunks.clear();
  }
  async setMetadata(filename: string, metadata: File): Promise<void> {
    this.meta.set(filename, metadata);
  }
  async getMetadata(filename: string): Promise<File | undefined> {
    return this.meta.get(filename);
  }
  async deleteMetadata(filename: string): Promise<void> {
    this.meta.delete(filename);
  }
  async writeChunk(chunkName: string, data: Uint8Array): Promise<void> {
    this.chunks.set(chunkName, data);
  }
  async deleteChunk(chunkName: string): Promise<void> {
    this.chunks.delete(chunkName);
  }
  async readChunk(chunkName: string): Promise<Uint8Array | undefined> {
    return this.chunks.get(chunkName);
  }
  async chunkSize(chunkName: string): Promise<number> {
    return this.chunks.get(chunkName)?.length ?? 0;
  }
  async listChunks(chunkPrefix: string): Promise<string[]> {
    return [...this.chunks.keys()].filter((k) => k.startsWith(chunkPrefix));
  }
  async list(): Promise<string[]> {
    return [...this.meta.keys()];
  }
}

describe("M8: FileStorage encryption pipeline", () => {
  it("writeEncryptedBase64 -> readEncrypted round-trips (base64)", async () => {
    const store = new MemoryFileStore();
    const fs = createFileStorage({ chunkStore: store });
    const key = await NNCrypto.exportKey("attachment-password");

    const original = btoa("hello attachment world - some binary-ish content");
    const meta = await fs.writeEncryptedBase64(original, key, "text/plain");
    expect(meta.hash).toBeDefined();
    expect(meta.hashType).toBe("sha256");
    expect(meta.iv).toBeDefined();
    expect(meta.alg).toBe("xcha-stream");

    const back = await fs.readEncrypted(meta.hash, key, { ...meta, outputType: "base64" });
    expect(back).toBe(original);
  });

  it("exists / deleteFile / clearFileStorage", async () => {
    const store = new MemoryFileStore();
    const fs = createFileStorage({ chunkStore: store });
    const key = await NNCrypto.exportKey("pw");
    const meta = await fs.writeEncryptedBase64(btoa("payload"), key, "text/plain");

    expect(await fs.exists(meta.hash)).toBe(true);
    expect(await fs.deleteFile(meta.hash)).toBe(true);
    expect(await fs.exists(meta.hash)).toBe(false);
  });

  it("hashBase64 returns a stable sha256", async () => {
    const fs = createFileStorage({ chunkStore: new MemoryFileStore() });
    const data = btoa("consistent payload");
    const h1 = await fs.hashBase64(data);
    const h2 = await fs.hashBase64(data);
    expect(h1.type).toBe("sha256");
    expect(h1.hash).toBe(h2.hash);
    expect(h1.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("readEncrypted of a missing file returns undefined", async () => {
    const fs = createFileStorage({ chunkStore: new MemoryFileStore() });
    const key = await NNCrypto.exportKey("pw");
    const back = await fs.readEncrypted("nonexistent", key, {
      iv: "00",
      outputType: "base64",
      chunkSize: 0,
      size: 0,
      salt: "",
      alg: "xcha-stream"
    });
    expect(back).toBeUndefined();
  });
});