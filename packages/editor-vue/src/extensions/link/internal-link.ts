/**
 * Pure `nn://` internal-link URL helpers (note-linking). Self-contained — no
 * `@notesnook/core`, no `@notesnook-vue/contracts` (which transitively pulls
 * `@notesnook/core`), so editor-vue stays a pure lower layer. Mirrors the API
 * of upstream's `@notesnook/core` `utils/internal-link.ts` so a note written
 * here round-trips byte-for-byte with upstream Notesnook.
 *
 * Scheme: `nn://<type>/<id>` with an optional `?blockId=<id>` query for
 * block/section links. `type` is one of the deep-link kinds (note/notebook/
 * monograph); note-links use `note`. Examples:
 *   nn://note/abc
 *   nn://note/abc?blockId=blk-1
 *
 * Parsing uses the URL API: protocol `nn:`, hostname is the `type`, the first
 * pathname segment is the `id`, and `blockId` is read from `searchParams`.
 * Never throws — a malformed input yields `null`.
 */
export const NN_PROTOCOL = "nn";

export type InternalLinkType = "note" | "notebook" | "monograph";

export interface InternalLinkParams {
  /** Target a specific block/heading within the note. */
  blockId?: string;
}

export interface ParsedInternalLink {
  type: InternalLinkType;
  id: string;
  params: InternalLinkParams;
}

const TYPES: readonly InternalLinkType[] = ["note", "notebook", "monograph"];

function isInternalLinkType(value: string): value is InternalLinkType {
  return (TYPES as readonly string[]).includes(value);
}

/**
 * Build an `nn://<type>/<id>` URL, appending `?blockId=<id>` when `params.blockId`
 * is a non-empty string. Uses the URL API + `searchParams` for safe encoding.
 */
export function createInternalLink(
  type: InternalLinkType,
  id: string,
  params?: InternalLinkParams
): string {
  const url = new URL(`${NN_PROTOCOL}://${type}/${id}`);
  if (params?.blockId) url.searchParams.set("blockId", params.blockId);
  return url.toString();
}

/**
 * Parse an `nn://` URL into a {@link ParsedInternalLink}, or `null` if it is not
 * a valid internal link (wrong protocol, unknown type, empty/multi-segment id,
 * or a URL the parser rejects). Never throws; a non-string input yields `null`.
 */
export function parseInternalLink(href: string | null | undefined): ParsedInternalLink | null {
  if (typeof href !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${NN_PROTOCOL}:`) return null;

  const type = parsed.hostname;
  if (!isInternalLinkType(type)) return null;

  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 1) return null;
  const id = segments[0]!;
  if (!id) return null;

  const blockId = parsed.searchParams.get("blockId");
  return { type, id, params: blockId ? { blockId } : {} };
}

/** True if `href` is an `nn://` internal link (any type). */
export function isInternalLink(href: string | null | undefined): boolean {
  return typeof href === "string" ? href.startsWith("nn://") : false;
}

/** True if `href` is an `nn://note/` note link specifically. */
export function isNoteLink(href: string | null | undefined): boolean {
  return typeof href === "string" ? href.startsWith("nn://note/") : false;
}

/** The note id encoded in an `nn://note/<id>` link, or `null`. */
export function noteIdFromLink(href: string | null | undefined): string | null {
  if (!isNoteLink(href)) return null;
  return parseInternalLink(href)?.id ?? null;
}

/** The `blockId` query param of an `nn://note/<id>?blockId=<id>` link, or `null`. */
export function blockIdFromLink(href: string | null | undefined): string | null {
  if (!isNoteLink(href)) return null;
  return parseInternalLink(href)?.params.blockId ?? null;
}