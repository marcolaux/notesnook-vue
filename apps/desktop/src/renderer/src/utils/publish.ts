/**
 * Pure publish logic (Phase 5.1) — helpers for the note-publishing store that
 * publishes a note to the web via `db.monographs`. Kept framework-agnostic so
 * it is unit-tested in isolation (see `tests/contract/publish.spec.ts`). The
 * `usePublishStore` composes these for the active note.
 *
 * Publishing is auth-gated (the server call inside `db.monographs.publish`
 * throws "Please login to publish a note." without a token) and vault-gated
 * (locked content cannot be published). The store does NOT pre-check these —
 * it lets `db.monographs.publish` throw and routes the error to `lastError`
 * (matches the never-throws pattern; the store stays the single source of
 * truth for error text). These helpers only shape the request + read the URL.
 */

import type { Monograph } from "@notesnook-vue/contracts";

/** Options passed to `db.monographs.publish`. `password` encrypts the public
 *  page; `selfDestruct` deletes the monograph after its first view. */
export interface PublishOptions {
  password?: string;
  selfDestruct?: boolean;
}

/**
 * Shape a {@link PublishOptions} bag, omitting `undefined` fields so the call
 * stays `exactOptionalPropertyTypes`-safe (a literal `{ selfDestruct: undefined }`
 * would otherwise be a TS2379 error and could surprise the server). Mirrors the
 * `buildSyncOptions` pattern in `utils/sync.ts`.
 */
export function buildPublishOptions(opts: {
  password?: string;
  selfDestruct?: boolean;
} = {}): PublishOptions {
  const out: PublishOptions = {};
  if (opts.password !== undefined) out.password = opts.password;
  if (opts.selfDestruct !== undefined) out.selfDestruct = opts.selfDestruct;
  return out;
}

/**
 * The public URL of a published note, read from the persisted `Monograph` row
 * (the server returns `publishUrl` in the publish response and core stores it
 * locally). Do NOT hand-construct `https://monogr.ph/<id>` — `publishUrl` is
 * authoritative (the server may use a slug/hash). Returns `""` for an
 * unpublished/unknown note so the view can render an empty field without a null
 * check.
 */
export function formatPublishUrl(m: Monograph | undefined): string {
  return m?.publishUrl ?? "";
}