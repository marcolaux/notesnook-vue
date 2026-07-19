/*
Ported from @notesnook/editor (GPL-3.0), extensions/embed/embed.ts — the
storage-format option/attribute types. Kept in sync with the upstream d.ts.

Scoped difference from upstream: `EmbedAlignmentOptions` drops `textDirection`,
which in upstream comes from the separate `text-direction` extension (not ported
in this increment). The embed node's own schema only carries `align`, so this
does not affect round-trip.
*/
export type EmbedSizeOptions = {
  width: number;
  height: number;
};

export type EmbedAlignmentOptions = {
  align?: "center" | "left" | "right";
};

export type EmbedAttributes = Partial<EmbedSizeOptions> & {
  src: string;
};

export type Embed = Required<EmbedAttributes> & EmbedAlignmentOptions;

export interface EmbedOptions {
  HTMLAttributes: Record<string, unknown>;
}