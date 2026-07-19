/**
 * Stub `IFileStorage` for the de-risk Gate — every method throws. Attachments
 * are never touched during `db.init()` / `initCollections()` with no logged-in
 * user, so this is enough to prove the pipeline. Replaced by the real
 * `FileStorage` (M8) once the pipeline is proven.
 */
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

function notImplemented(name: string): never {
  throw new Error(`StubFileStorage.${name}() not implemented (M8 will provide real file storage)`);
}

export class StubFileStorage implements IFileStorage {
  downloadFile(_filename: string, _requestOptions: RequestOptions): Cancellable<boolean> {
    notImplemented("downloadFile");
  }
  uploadFile(_filename: string, _requestOptions: RequestOptions): Cancellable<boolean> {
    notImplemented("uploadFile");
  }
  readEncrypted<TOutputFormat extends DataFormat>(
    _filename: string,
    _encryptionKey: SerializedKey,
    _cipherData: FileEncryptionMetadataWithOutputType<TOutputFormat>
  ): Promise<Output<TOutputFormat> | undefined> {
    return Promise.reject(notImplemented("readEncrypted"));
  }
  writeEncryptedBase64(
    _data: string,
    _encryptionKey: SerializedKey,
    _mimeType: string
  ): Promise<FileEncryptionMetadataWithHash> {
    return Promise.reject(notImplemented("writeEncryptedBase64"));
  }
  deleteFile(_filename: string, _requestOptions?: RequestOptions): Promise<boolean> {
    return Promise.reject(notImplemented("deleteFile"));
  }
  bulkDeleteFiles(_filenames: string[], _requestOptions?: RequestOptions): Promise<boolean> {
    return Promise.reject(notImplemented("bulkDeleteFiles"));
  }
  exists(_filename: string): Promise<boolean> {
    return Promise.reject(notImplemented("exists"));
  }
  bulkExists(_filenames: string[]): Promise<string[]> {
    return Promise.reject(notImplemented("bulkExists"));
  }
  getUploadedFileSize(_filename: string): Promise<number> {
    return Promise.reject(notImplemented("getUploadedFileSize"));
  }
  clearFileStorage(): Promise<void> {
    return Promise.reject(notImplemented("clearFileStorage"));
  }
  hashBase64(_data: string): Promise<{ hash: string; type: string }> {
    return Promise.reject(notImplemented("hashBase64"));
  }
}