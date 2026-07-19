/*
Ported from @notesnook/editor (GPL-3.0), extensions/attachment/types.ts — the
image storage-format option/attribute types. Kept in sync with the upstream
`ImageAttachment` / `ImageAlignmentOptions` / `ImageOptions` declarations.

Scoped difference from upstream: `ImageAttributes` drops `textDirection`, which
in upstream comes from the separate `text-direction` extension (not ported in
this increment). The image node's own schema only carries `align` (like the
embed port), so this does not affect round-trip. `float` (from
`ImageAlignmentOptions`) is retained on the type for parity; the component
applies alignment via flex-justify rather than CSS float.
*/
export type ImageAlignmentOptions = {
  float?: boolean;
  align?: "center" | "left" | "right";
};

export interface ImageAttachment {
  hash: string;
  filename: string;
  mime: string;
  size: number;
  progress?: number;
  type?: "image";
  width?: number;
  height?: number;
  src?: string;
  aspectRatio?: number;
}

export type ImageAttributes = ImageAttachment & ImageAlignmentOptions;

export type ImageSize = {
  width: number;
  height: number;
};

export interface ImageOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
}