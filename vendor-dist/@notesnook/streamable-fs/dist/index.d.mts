//#region src/types.d.ts
type File = {
  filename: string;
  size: number;
  type: string;
  additionalData?: {
    [key: string]: unknown;
  };
};
//#endregion
//#region src/interfaces.d.ts
interface IStreamableFS {
  createFile(filename: string, size: number, type: string, options?: {
    overwrite?: boolean;
  }): Promise<FileHandle>;
  readFile(filename: string): Promise<FileHandle | undefined>;
  exists(filename: string): Promise<boolean>;
  deleteFile(filename: string): Promise<boolean>;
  bulkDeleteFiles(filenames: string[]): Promise<boolean>;
  list(): Promise<string[]>;
  moveFile(source: FileHandle, dest: FileHandle): Promise<void>;
  clear(): Promise<void>;
}
interface IFileStorage {
  clear(): Promise<void>;
  setMetadata(filename: string, metadata: File): Promise<void>;
  getMetadata(filename: string): Promise<File | undefined>;
  deleteMetadata(filename: string): Promise<void>;
  writeChunk(chunkName: string, data: Uint8Array): Promise<void>;
  deleteChunk(chunkName: string): Promise<void>;
  readChunk(chunkName: string): Promise<Uint8Array | undefined>;
  chunkSize(chunkName: string): Promise<number>;
  listChunks(chunkPrefix: string): Promise<string[]>;
  list(): Promise<string[]>;
}
//#endregion
//#region src/filehandle.d.ts
declare class FileHandle {
  private readonly storage;
  readonly file: File;
  readonly chunks: string[];
  constructor(storage: IFileStorage, file: File, chunks: string[]);
  get readable(): ReadableStream<Uint8Array<ArrayBufferLike>>;
  get writeable(): WritableStream<Uint8Array<ArrayBufferLike>>;
  writeChunkAtOffset(offset: number, chunk: Uint8Array): Promise<void>;
  addAdditionalData<T>(key: string, value: T): Promise<void>;
  delete(): Promise<void>;
  private getChunkKey;
  readChunk(offset: number): Promise<Uint8Array | null>;
  readChunks(from: number, length: number): Promise<Blob>;
  toBlob(): Promise<Blob>;
  size(): Promise<number>;
  listChunks(): Promise<string[]>;
  private lastOffset;
}
//#endregion
//#region src/index.d.ts
declare class StreamableFS implements IStreamableFS {
  private readonly storage;
  /**
   * @param db name of the indexeddb database
   */
  constructor(storage: IFileStorage);
  createFile(filename: string, size: number, type: string, options?: {
    overwrite?: boolean;
  }): Promise<FileHandle>;
  readFile(filename: string): Promise<FileHandle | undefined>;
  exists(filename: string): Promise<boolean>;
  list(): Promise<string[]>;
  deleteFile(filename: string): Promise<boolean>;
  bulkDeleteFiles(filenames: string[]): Promise<boolean>;
  moveFile(source: FileHandle, dest: FileHandle): Promise<void>;
  clear(): Promise<void>;
}
//#endregion
export { type File, type FileHandle, type IFileStorage, StreamableFS };