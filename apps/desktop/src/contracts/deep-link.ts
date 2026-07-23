/**
 * Deep-link parser (Phase 6.5) — pure, dependency-free, shared by the Electron
 * main process (protocol registration + dispatch) and the contract tests.
 *
 * Scheme: `nn://<kind>/<id>` where `<kind>` ∈ `note` | `notebook` | `monograph`.
 * Examples: `nn://note/abc123`, `nn://notebook/nb-7`, `nn://monograph/m-42`.
 *
 * Parsing uses the URL API: `protocol` is `nn:`, the hostname is the kind, and
 * the first pathname segment is the id. A trailing slash, query, and hash are
 * tolerated; an empty or multi-segment id is rejected (returns `null`) so a
 * stray `nn://note/` or `nn://note/a/b` does not dispatch to a bogus id.
 *
 * The parser is intentionally generic across all three kinds so it is stable as
 * destination views land. The main process currently *dispatches* only `note`
 * targets (the `app:open-note` channel + the Notes view exist); `notebook`/
 * `monograph` routing is deferred until those views are built (Phase 3.2/6).
 */
export const NN_PROTOCOL = "nn";

export type DeepLinkKind = "note" | "notebook" | "monograph";

export interface DeepLinkTarget {
  kind: DeepLinkKind;
  id: string;
  /**
   * Optional block/heading id targeting a specific section within the note
   * (the `?blockId=<id>` query on an `nn://note/<id>` link). Absent on plain
   * whole-note deep links. Kept optional so every pre-existing target (and
   * every caller that ignores extra fields) keeps working unchanged.
   */
  blockId?: string;
}

const KINDS: readonly DeepLinkKind[] = ["note", "notebook", "monograph"];

function isDeepLinkKind(value: string): value is DeepLinkKind {
  return (KINDS as readonly string[]).includes(value);
}

/**
 * Parse an `nn://` URL into a `DeepLinkTarget`, or `null` if it is not a valid
 * deep link (wrong protocol, unknown kind, empty/multi-segment id, or a URL the
 * parser rejects). Never throws — a malformed input yields `null`.
 */
export function parseDeepLink(url: string): DeepLinkTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // `URL` normalises `nn://note/abc` → protocol "nn:", hostname "note",
  // pathname "/abc". Compare against the bare protocol (no trailing ":").
  if (parsed.protocol !== `${NN_PROTOCOL}:`) return null;

  const kind = parsed.hostname;
  if (!isDeepLinkKind(kind)) return null;

  // First pathname segment is the id; ignore a trailing slash, query, hash.
  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 1) return null;
  const id = segments[0]!;
  if (!id) return null;

  // `?blockId=<id>` (note section links) is tolerated and surfaced here.
  // Other query params are ignored — only `blockId` is meaningful.
  const blockId = parsed.searchParams.get("blockId") ?? undefined;

  return { kind, id, ...(blockId ? { blockId } : {}) };
}

/** Build an `nn://<kind>/<id>` URL from a target, appending `?blockId=<id>` when present. */
export function buildDeepLink(target: DeepLinkTarget): string {
  const base = `${NN_PROTOCOL}://${target.kind}/${target.id}`;
  if (!target.blockId) return base;
  // Use the URL API for safe encoding of the query param.
  const url = new URL(base);
  url.searchParams.set("blockId", target.blockId);
  return url.toString();
}