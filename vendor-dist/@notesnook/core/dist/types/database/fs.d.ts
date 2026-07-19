import TokenManager from "../api/token-manager.js";
import { FileEncryptionMetadataWithOutputType, IFileStorage } from "../interfaces.js";
import { DataFormat, SerializedKey } from "@notesnook/crypto";
import EventManager from "../utils/event-manager.js";
export type FileStorageAccessor = () => FileStorage;
export type DownloadableFile = {
    filename: string;
    chunkSize: number;
};
export type QueueItem = DownloadableFile & {
    cancel?: (reason?: string) => Promise<void>;
    operation?: Promise<boolean>;
};
export declare class FileStorage {
    private readonly fs;
    private readonly tokenManager;
    private readonly eventManager;
    id: number;
    downloads: Map<string, QueueItem>;
    uploads: Map<string, QueueItem>;
    groups: {
        downloads: Map<string, Set<string>>;
        uploads: Map<string, Set<string>>;
    };
    constructor(fs: IFileStorage, tokenManager: TokenManager, eventManager: EventManager);
    queueDownloads(files: DownloadableFile[], groupId: string, eventData?: Record<string, unknown>): Promise<Set<string> | undefined>;
    queueUploads(files: DownloadableFile[], groupId: string): Promise<Set<string> | undefined>;
    downloadFile(groupId: string, filename: string, chunkSize: number): Promise<boolean>;
    cancel(groupId: string): Promise<void>;
    readEncrypted<TOutputFormat extends DataFormat>(filename: string, encryptionKey: SerializedKey, cipherData: FileEncryptionMetadataWithOutputType<TOutputFormat>): Promise<import("../interfaces.js").Output<TOutputFormat> | undefined>;
    writeEncryptedBase64(data: string, encryptionKey: SerializedKey, mimeType: string): Promise<import("../interfaces.js").FileEncryptionMetadataWithHash>;
    deleteFile(filename: string, localOnly?: boolean): Promise<boolean>;
    bulkDeleteFiles(filenames: string[], localOnly?: boolean): Promise<boolean>;
    exists(filename: string): Promise<boolean>;
    clear(): Promise<void>;
    hashBase64(data: string): Promise<{
        hash: string;
        type: string;
    }>;
    getUploadedFileSize(filename: string): Promise<number>;
}
