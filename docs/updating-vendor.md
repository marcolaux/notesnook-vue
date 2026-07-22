# Updating the vendored `@notesnook/*` packages

This repo vendors the upstream Notesnook data engine instead of depending on
it from npm. There are two pieces, with very different roles:

| Path | What it is | In git? |
| --- | --- | --- |
| `vendor/notesnook` | A git **submodule** pointing at `streetwriters/notesnook` at a pinned commit. The source we build from. | Only the gitlink (1 entry). The 482 MB working tree is local, *not* committed. |
| `vendor-dist/@notesnook/*` | The **built dist** (the actual artifact the app imports). 7 packages, listed as npm workspaces in the root `package.json`. | Yes — committed, ~12 MB. This is what `npm install` / `npm run dev` / CI consume. |

**Policy (Option A):** `vendor-dist/` is a committed release-time artifact.
`npm install` + `npm run dev` + CI run straight off it — no build step, no
submodule init, no toolchain. The tradeoff is that build artifacts live in git;
we accept that for the frictionless clone. The drift guard (below) is what
keeps the committed dist honest.

Of the 7 vendored packages:

- **5 runtime** (`core`, `crypto`, `logger`, `sodium`, `streamable-fs`) are
  built from the submodule source by `scripts/build-vendor-from-source.mjs`
  with **zero patches** to upstream.
- **2 types-only** (`editor`, `theme`) are copied as `dist/types` from a
  separate full upstream checkout by `scripts/build-vendor.mjs`. They don't go
  stale (consumed `import type`-only) and are rarely touched.

`@notesnook/intl`, `common`, and `ui` are **not** vendored — this repo doesn't
use them.

---

## How you know upstream moved

The app notifies you at runtime: `apps/desktop/src/main/upstream-checker.ts`
fetches the latest GitHub desktop release and compares it against the baked
baseline in `apps/desktop/src/contracts/upstream-baseline.generated.ts` (the
newest desktop-stable release that is an ancestor of our pinned submodule
commit). A newer upstream release surfaces a badge in the title bar.

To check from the command line, look at the submodule pin:

```sh
git -C vendor/notesnook describe --tags --always     # current pin
git -C vendor/notesnook tag --sort=-v:refname | head  # latest available tags
```

---

## Step A — Runtime bump (the common case)

Use this when a new upstream release changes `core` / `crypto` / `logger` /
`sodium` / `streamable-fs`. One command does the submodule bump + rebuild +
codegen:

```sh
npm run vendor:bump              # → latest desktop-stable release tag
# or pin a specific tag:
npm run vendor:bump -- v3.4.4
```

`vendor:bump` (`scripts/vendor-bump.mjs`):

1. Ensures the submodule is checked out (`git submodule update --init` if not).
2. `git fetch --tags` in the submodule, then checks out the target tag
   (detached HEAD). `latest` = newest `vX.Y.Z` tag (no prereleases).
3. Runs `npm run build:vendor:src` → rebuilds the 5 runtime packages into
   `vendor-dist/`, regenerates `production-hosts.generated.ts` and
   `upstream-baseline.generated.ts`, and records the source SHA in
   `vendor-dist/@notesnook/.source-sha`.

It does **not** commit. Then:

```sh
npm run test:contract            # compatibility against the new core
npm run vendor:check             # confirm dist matches the new pin
git add vendor/notesnook vendor-dist \
        apps/desktop/src/contracts/upstream-baseline.generated.ts \
        apps/desktop/src/contracts/production-hosts.generated.ts
git commit -m "chore(vendor): bump @notesnook/* to upstream v3.4.4 (submodule <short-sha>)"
```

> `upstream-baseline.generated.ts` regeneration needs the GitHub API. If you
> were offline, the build kept the committed baseline — re-run
> `npm run gen:upstream-baseline` when online and amend the commit.

---

## Step B — Editor / theme types bump (rare)

Only when an upstream release changes `@notesnook/editor` or `@notesnook/theme`
*types*. These are types-only and consumed `import type`-only, so they rarely
change. They are **not** built from the submodule by us (that needs the editor
`langen` codegen + toolchain); instead you copy `dist/types` from a full
upstream checkout that you build yourself:

```sh
# In a separate clone of streetwriters/notesnook, at the matching tag:
cd /path/to/notesnook-checkout
git checkout v3.4.4
npm install && npm run build     # produces packages/editor/dist + packages/theme/dist

# Back in this repo:
UPSTREAM=/path/to/notesnook-checkout node scripts/build-vendor.mjs
```

`build-vendor.mjs` copies `editor`/`theme` `dist/types` into `vendor-dist/`
and re-runs the codegen generators. Then `test:contract`, stage, and commit as
in Step A.

If a bump touches *both* runtime and editor/theme, run Step A first, then
Step B.

---

## Drift guard

```sh
npm run vendor:check
```

`scripts/vendor-check.mjs` compares the submodule gitlink committed in the
superproject (`git ls-tree HEAD vendor/notesnook` — no submodule checkout
needed) against the SHA recorded in `vendor-dist/@notesnook/.source-sha` when
the dist was last built. Mismatch ⇒ the committed dist is stale relative to
the pin (submodule moved but dist wasn't rebuilt, or vice versa). This is the
exact hazard that once left a stale `Attachments` dist in the tree — see the
`build-vendor-from-source.mjs` header for the gory details.

This runs in CI (`Vendor drift guard` step) on every push/PR, so a stale dist
can't land. If it fails locally or in CI:

```sh
npm run build:vendor:src         # rebuild from the current pin
git add vendor-dist vendor/notesnook
git commit -m "chore(vendor): rebuild vendor-dist from pinned submodule"
```

---

## Troubleshooting

- **`vendor/notesnook not checked out`** — run `git submodule update --init`.
  The submodule is required to build (`build:vendor:src`) and to bump, but
  **not** to install/dev/test/CI — those consume the committed `vendor-dist/`.
- **`gen-upstream-baseline` failed (offline / rate-limited)** — non-fatal; the
  build keeps the committed baseline. Re-run `npm run gen:upstream-baseline`
  with `GITHUB_TOKEN` set when online, then amend.
- **`npm ci` / `npm install` fail after a bump** — make sure you staged the
  `vendor-dist/@notesnook/*/package.json` files (the workspaces list them).
- **Build tools missing in the submodule** — `build:vendor:src` auto-installs
  `tsdown`/`tsc`/`tsgo` at the submodule root on first run (idempotent).
- **Submodule working tree looks dirty after a build** — the build runs
  `git checkout -- packages` in the submodule to restore tracked files that
  `npm install --ignore-scripts` dirties. If it warns it couldn't, run
  `git -C vendor/notesnook checkout -- packages` yourself.