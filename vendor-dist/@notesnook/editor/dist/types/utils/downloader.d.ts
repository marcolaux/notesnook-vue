export type DownloadOptions = {
    corsHost?: string;
    signal?: AbortSignal;
};
export declare function corsify(url?: string, host?: string): string | undefined;
export declare function downloadImage(url: string, options?: DownloadOptions): Promise<{
    blob: Blob;
    url: string;
    mimeType: string;
    size: number;
} | undefined>;
export declare function toDataURL(blob: Blob): Promise<string>;
export declare function toBlobURL(dataurl: string, type?: "image" | "other", mimeType?: string, id?: string): string | undefined;
export declare function revokeBloburl(id: string): void;
export declare function toBlob(dataurl: string, mimeType: string): Blob | undefined;
