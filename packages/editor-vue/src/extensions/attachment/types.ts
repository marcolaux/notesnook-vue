/*
Ported from @notesnook/editor (GPL-3.0), extensions/attachment/types.ts +
the attribute option types declared in the editor .d.ts (AttachmentOptions,
BaseAttachment/FileAttachment). These are the storage-format contracts — keep
them in sync with the upstream d.ts if it changes.
*/
export type AttachmentType = "image" | "file" | "camera";

export interface AttachmentOptions {
  types: string[];
  HTMLAttributes: Record<string, unknown>;
}

export interface FileAttachment {
  hash: string;
  filename: string;
  mime: string;
  size: number;
  progress?: number;
  type?: AttachmentType;
}