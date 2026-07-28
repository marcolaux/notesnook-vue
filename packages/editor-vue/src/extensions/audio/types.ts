/*
Audio node-view storage-format option/attribute types. Mirrors
extensions/image/types.ts (the image node) so an audio attachment round-trips
with the same attribute surface (hash/filename/mime/size/aspectRatio +
width/height/align/src/progress). The node-view renders a styled
`<audio controls>` player; the blob is lazy-loaded from the encrypted
attachment via `editor.storage.getAttachmentData({ hash })` (the same hook the
image node-view uses — see attachments-bridge.ts).
*/
export type AudioAlignmentOptions = {
  float?: boolean;
  align?: "center" | "left" | "right";
};

export interface AudioAttachment {
  hash: string;
  filename: string;
  mime: string;
  size: number;
  progress?: number;
  type?: "audio";
  width?: number;
  height?: number;
  src?: string;
  aspectRatio?: number;
}

export type AudioAttributes = AudioAttachment & AudioAlignmentOptions;

export type AudioSize = {
  width: number;
  height: number;
};

export interface AudioOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
}