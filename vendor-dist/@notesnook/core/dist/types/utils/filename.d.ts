export declare function getFileNameWithExtension(filename: string, mime: string | undefined): Promise<string>;
export declare const PDFMimeType = "application/pdf";
export declare const DocumentMimeTypes: string[];
export declare function isDocument(mime: string): boolean;
export declare const WebClipMimeType = "application/vnd.notesnook.web-clip";
export declare function isWebClip(mime: string): mime is "application/vnd.notesnook.web-clip";
export declare function isImage(mime: string): boolean;
export declare function isVideo(mime: string): boolean;
export declare function isAudio(mime: string): boolean;
