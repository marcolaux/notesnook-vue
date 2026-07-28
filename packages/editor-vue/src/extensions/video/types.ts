/*
Video node-view storage-format option/attribute types. Mirrors
extensions/image/types.ts (the image node) so a video attachment round-trips
with the same attribute surface (hash/filename/mime/size/aspectRatio +
width/height/align/src/progress). The node-view renders a styled
`<video controls>` player; the blob is lazy-loaded from the encrypted
attachment via `editor.storage.getAttachmentData({ hash })` (the same hook the
image node-view uses — see attachments-bridge.ts).
*/
export type VideoAlignmentOptions = {
  float?: boolean;
  align?: "center" | "left" | "right";
};

export interface VideoAttachment {
  hash: string;
  filename: string;
  mime: string;
  size: number;
  progress?: number;
  type?: "video";
  width?: number;
  height?: number;
  src?: string;
  aspectRatio?: number;
}

export type VideoAttributes = VideoAttachment & VideoAlignmentOptions;

export type VideoSize = {
  width: number;
  height: number;
};

export interface VideoOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
}