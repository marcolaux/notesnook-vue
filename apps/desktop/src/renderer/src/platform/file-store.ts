/*
Renderer chunk store — implements `@notesnook/streamable-fs`'s `IFileStorage`
by forwarding each method to the main-process node-fs store over the tRPC
bridge (`desktop.fs.*`). This is the desktop counterpart to upstream's
`IndexedDBFileStore`/`OriginPrivateFileSystem` (which use browser storage).
*/
import type { IFileStorage, File } from "@notesnook/streamable-fs";
import { desktop } from "./desktop-bridge";

export class NodeFSFileStore implements IFileStorage {
  async clear(): Promise<void> {
    await desktop.fs.clear.mutate();
  }
  async setMetadata(filename: string, metadata: File): Promise<void> {
    await desktop.fs.setMetadata.mutate({ filename, metadata });
  }
  async getMetadata(filename: string): Promise<File | undefined> {
    return desktop.fs.getMetadata.query({ filename });
  }
  async deleteMetadata(filename: string): Promise<void> {
    await desktop.fs.deleteMetadata.mutate({ filename });
  }
  async writeChunk(chunkName: string, data: Uint8Array): Promise<void> {
    await desktop.fs.writeChunk.mutate({ chunkName, data });
  }
  async deleteChunk(chunkName: string): Promise<void> {
    await desktop.fs.deleteChunk.mutate({ chunkName });
  }
  async readChunk(chunkName: string): Promise<Uint8Array | undefined> {
    // tRPC infers readChunk's Uint8Array output as a structural subset; cast
    // back to the full type (the value is a real Uint8Array over IPC).
    return (await desktop.fs.readChunk.query({ chunkName })) as Uint8Array | undefined;
  }
  async chunkSize(chunkName: string): Promise<number> {
    return desktop.fs.chunkSize.query({ chunkName });
  }
  async listChunks(chunkPrefix: string): Promise<string[]> {
    return desktop.fs.listChunks.query({ chunkPrefix });
  }
  async list(): Promise<string[]> {
    return desktop.fs.list.query();
  }
}