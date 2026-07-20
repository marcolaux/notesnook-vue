/*
Attachment-manager pure helpers — no `db`/core dependency, so they're unit-
testable in node without a database. The `db`-backed orchestration lives in
`stores/attachments.ts`; this module holds only the deterministic pieces:

  - `formatBytes` — human-readable size for the list + summary.
  - `ATTACHMENT_FILTERS` — the ordered filter-tab config, each mapping an
    `AttachmentFilter` id to its core `FilteredSelector` getter
    (`db.attachments.all/.images/.videos/.audios/.documents/.orphaned`). The
    store resolves the active selector via `selector(db)`; tests pass a fake
    `db` with matching getters.
  - `mimeCategory` — coarse media category for the row icon, derived from the
    mime prefix (matches how core's `images`/`videos`/`audios` selectors
    filter by prefix). `document` covers the common document mimetypes so the
    row shows the document icon rather than the generic file icon.

The icon SVGs themselves live in `AttachmentsSection.vue` (the codebase
inlines Lucide-style stroke SVGs per-component — there is no shared icon
module and `@mdi/js` is not installed).
*/
import type { Attachment, Database } from "@notesnook-vue/contracts";
import type { FilteredSelector } from "@notesnook-vue/contracts";

export type AttachmentFilter =
  | "all"
  | "images"
  | "videos"
  | "audios"
  | "documents"
  | "orphaned";

export interface AttachmentFilterDef {
  id: AttachmentFilter;
  label: string;
  /** Resolve this filter's core selector against a `Database` (real or fake). */
  selector: (db: Database) => FilteredSelector<Attachment>;
}

/** The ordered filter tabs (All / Images / Videos / Audio / Documents /
 *  Orphaned), each backed by a core `db.attachments.*` selector. */
export const ATTACHMENT_FILTERS: AttachmentFilterDef[] = [
  { id: "all", label: "All", selector: (db) => db.attachments.all },
  { id: "images", label: "Images", selector: (db) => db.attachments.images },
  { id: "videos", label: "Videos", selector: (db) => db.attachments.videos },
  { id: "audios", label: "Audio", selector: (db) => db.attachments.audios },
  { id: "documents", label: "Documents", selector: (db) => db.attachments.documents },
  { id: "orphaned", label: "Orphaned", selector: (db) => db.attachments.orphaned }
];

/** Coarse media category for the row icon. Matches core's prefix-based
 *  `images`/`videos`/`audios` selectors; `document` covers the common document
 *  mimetypes so they get the document icon rather than the generic file icon. */
export type MimeCategory = "image" | "video" | "audio" | "document" | "file";

const DOCUMENT_MIMES = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.ms-word",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip"
]);

export function mimeCategory(mime: string | undefined | null): MimeCategory {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (DOCUMENT_MIMES.has(m) || m.startsWith("text/")) return "document";
  return "file";
}

/** Human-readable byte size (B / KB / MB / GB / TB). 0 and negative → "0 B". */
export function formatBytes(n: number | undefined | null): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / Math.pow(1024, i);
  const formatted = i === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
  return `${formatted} ${units[i]}`;
}