/*
Minimal data-URL helpers, faithful to `@notesnook/core`'s `DataURL` (which is
backed by `@readme/data-urls`). Vendored here so `packages/editor-vue` stays
free of a `@notesnook/core` / `@notesnook/common` runtime dependency (the latter
re-exports `DataURL` but pulls React into the bundle — a leak the 2.2 work
explicitly avoided).

Covers the shapes the renderer round-trips: `data:<mime>;base64,<payload>` and
URL-encoded `data:<mime>,<payload>` (optional `charset=` parameter). The
attachment blob path (Phase 6) produces base64 data URLs via `DataURL.fromObject`
in `@notesnook/core`; this parser extracts the same `mimeType` + `data` fields
that `toBlobURL` consumes.

Scoped difference from upstream:
  - `isValid` is a regex check, not `@readme/data-urls`'s `validate`. It only
    matters for the future `corsHost` rewrite in `corsify` (Phase 2.5 toolbar);
    until `corsHost` is set, `corsify` returns the URL unchanged regardless.
    If edge cases surface in Phase 6/2.5, swap this for `import { DataURL }
    from "@notesnook/core"` (React-free, already bundled in the renderer).
*/
const DATA_URL_RE =
  /^data:([a-zA-Z0-9!#$&'*+\-.^_`|~]+\/[a-zA-Z0-9!#$&'*+\-.^_`|~]+)?(;charset=[^,;]+)?(;base64)?,(.*)$/s;

export const DataURL = {
  isValid(url?: string | null): boolean {
    return typeof url === "string" && DATA_URL_RE.test(url);
  },

  toObject(dataurl: string): { mimeType?: string | undefined; data?: string | undefined } {
    const match = DATA_URL_RE.exec(dataurl);
    if (!match) return {};
    const mimeType = match[1] ?? undefined;
    const isBase64 = !!match[3];
    const raw = match[4] ?? "";
    const data = isBase64 ? raw : decodeURIComponent(raw);
    return { mimeType, data };
  }
};