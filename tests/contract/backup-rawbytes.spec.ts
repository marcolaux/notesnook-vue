// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createFileStorage } from "@/platform/fs";
import type { IFileStorage, File } from "@notesnook/streamable-fs";

/** In-memory `streamable-fs` chunk store — no node-fs, no IPC, no crypto. Lets
 *  us exercise `__rawWriteBytes`/`__rawReadStream` (which only re-chunk raw
 *  bytes) in isolation. */
class MemChunkStore implements IFileStorage {
  private chunks = new Map<string, Uint8Array>();
  private meta = new Map<string, File>();
  async clear(): Promise<void> {
    this.chunks.clear();
    this.meta.clear();
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
    this.chunks.set(chunkName, new Uint8Array(data));
  }
  async deleteChunk(chunkName: string): Promise<void> {
    this.chunks.delete(chunkName);
  }
  async readChunk(chunkName: string): Promise<Uint8Array | undefined> {
    const v = this.chunks.get(chunkName);
    return v ? new Uint8Array(v) : undefined;
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

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("DesktopFileStorage __rawWriteBytes / __rawReadStream (re-chunk round-trip)", () => {
  it("writes bytes and reads them back verbatim (single chunk)", async () => {
    const fs = createFileStorage({ chunkStore: new MemChunkStore() });
    const payload = new Uint8Array(800);
    for (let i = 0; i < payload.length; i++) payload[i] = i % 251;

    const ok = await fs.__rawWriteBytes("f1", payload, {
      size: payload.length,
      mimeType: "application/octet-stream",
      chunkSize: 524288
    });
    expect(ok).toBe(true);

    const stream = await fs.__rawReadStream("f1");
    expect(stream).toBeDefined();
    expect(await drain(stream!)).toEqual(payload);
  });

  it("round-trips a multi-chunk payload (>1 encrypted chunk) — boundary faithful", async () => {
    const fs = createFileStorage({ chunkStore: new MemChunkStore() });
    // chunkSize + ABYTES (17) = 524305 per stored chunk → ~3 chunks.
    const payload = new Uint8Array(1_200_000);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 7) % 251;

    expect(await fs.__rawWriteBytes("f2", payload, {
      size: payload.length,
      mimeType: "application/octet-stream",
      chunkSize: 524288
    })).toBe(true);

    const stream = await fs.__rawReadStream("f2");
    expect(await drain(stream!)).toEqual(payload);
  });

  it("__rawReadStream returns undefined for a missing file", async () => {
    const fs = createFileStorage({ chunkStore: new MemChunkStore() });
    expect(await fs.__rawReadStream("nope")).toBeUndefined();
  });

  it("__rawWriteBytes is idempotent in outcome — a second write keeps the data intact", async () => {
    const fs = createFileStorage({ chunkStore: new MemChunkStore() });
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    expect(await fs.__rawWriteBytes("f3", payload, {
      size: payload.length,
      mimeType: "application/octet-stream",
      chunkSize: 524288
    })).toBe(true);
    // A second write either skips (real encrypted blob with auth tags →
    // `handleIsComplete` true) or rewrites (raw test bytes → rewrites); either
    // way the outcome is success + intact data.
    expect(await fs.__rawWriteBytes("f3", payload, {
      size: payload.length,
      mimeType: "application/octet-stream",
      chunkSize: 524288
    })).toBe(true);
    const stream = await fs.__rawReadStream("f3");
    expect(await drain(stream!)).toEqual(payload);
  });
});