/*
Types for the Standard Notes (Lexical) → Notesnook (TipTap HTML) converter.

The converter is a *pure* tree-walk: it takes a Lexical editor-state JSON value
(the `note.text` SN serialises via `editor.getEditorState().toJSON()`) and emits
a TipTap HTML string. All side-effecting resolution (reading attachment bytes
off disk + `db.attachments.save`; creating/looking up tags + linking) is
injected via `Resolvers`, so the walk is unit-testable with stubs and free of
any db/editor dependency.

Emitted HTML is the canonical Notesnook persistence form
(`db.notes.add({ content: { type: "tiptap", data: html } })`); every editor
extension round-trips through its `parseHTML` rules, so the importer's output
re-parses to the same document the editor would have produced.
*/

/** A resolved attachment: the hash + metadata the emitted node references. */
export interface AttachmentRef {
  /** The `db.attachments.save` hash — `<img|audio|video|span data-hash="…">`. */
  hash: string;
  filename: string;
  mime: string;
  size: number;
  /** Image natural dimensions, when known (drives `data-aspect-ratio`). */
  width?: number;
  height?: number;
  aspectRatio?: number;
}

/** The reference the converter hands to the attachment resolver. */
export type AttachmentInput =
  | { kind: "snfile"; fileUuid: string }
  | { kind: "inline"; dataUrl: string; fileName?: string | undefined; mime?: string | undefined };

/** A resolved tag: the id + title for the inline tag-mention chip. */
export interface TagRef {
  id: string;
  title: string;
}

/**
 * Side-effecting resolvers the host supplies. Both MUST be idempotent per key
 * (the converter calls them once per unique fileUuid/src and once per unique
 * tag title within a note; the host de-dups across the whole run).
 */
export interface Resolvers {
  resolveAttachment(input: AttachmentInput): Promise<AttachmentRef | null>;
  resolveTag(title: string): Promise<TagRef | null>;
}

export interface ConvertStats {
  /** Number of attachment refs successfully resolved and emitted. */
  attachments: number;
  /** Number of tag refs successfully resolved and emitted. */
  tags: number;
  /** Human-readable descriptions of resolutions that failed (for the UI). */
  failed: string[];
}

export interface ConvertResult {
  /** The TipTap HTML body (no `<head>`/wrapper). */
  html: string;
  /** `preview_title` if the caller passed it, else the first heading text. */
  title: string | null;
  /** Resolved tag ids (for `db.relations` linking after `db.notes.add`). */
  tagIds: string[];
  stats: ConvertStats;
}

/**
 * The outer Standard Notes note object (the `.json` file body). Only `text`
 * (the Lexical editor-state JSON) is required; `preview_title` is the SN
 * title. The converter accepts the raw editor-state (`{ root }`) too, so it
 * works whether the caller passes the whole note or just `note.text`.
 */
export interface StandardNotesItem {
  preview_title?: string;
  title?: string;
  text?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
  uuid?: string;
}

/** Loose Lexical node shape — the converter only reads known fields. */
export interface LexicalNode {
  type?: string;
  text?: string;
  tag?: string;
  format?: number | string;
  direction?: string | null;
  indent?: number;
  listType?: string;
  start?: number;
  value?: number;
  checked?: boolean | null;
  headerState?: number;
  colSpan?: number;
  rowSpan?: number;
  backgroundColor?: string | null;
  width?: number;
  height?: number;
  url?: string;
  target?: string | null;
  rel?: string | null;
  title?: string | null;
  fileUuid?: string;
  zoomLevel?: number;
  src?: string;
  alt?: string;
  videoID?: string;
  id?: string;
  itemUuid?: string;
  mimeType?: string;
  fileName?: string;
  language?: string | null;
  open?: boolean;
  children?: LexicalNode[];
}

/** Lexical editor-state root (`editor.getEditorState().toJSON()`). */
export interface LexicalEditorState {
  root: LexicalNode;
}