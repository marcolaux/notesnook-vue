/**
 * English message catalog (Phase 2.6 / 7.1 i18n foundation).
 *
 * This is OUR catalog (Vue-native vue-i18n), seeded from the English strings
 * already in the codebase — NOT a port of upstream `@notesnook/intl`'s
 * `strings.ts` (which is Lingui+React-coupled to upstream's component
 * structure + a `generated/` codegen we don't have, and ships no real
 * translations beyond `en` + a pseudo locale). See `../index.ts` for the
 * rationale.
 *
 * Keys are nested by feature. Add keys here as strings are migrated out of
 * components (Phase 7.1 polish migrates the rest); the pseudo locale in
 * `./pseudo.ts` is generated from this so it stays in sync automatically.
 */
export default {
  common: {
    greeting: "Notesnook Vue"
  },
  sidebar: {
    notebooks: "Notebooks",
    noNotebooks: "No notebooks",
    tags: "Tags",
    noTags: "No tags",
    shortcuts: "Shortcuts",
    noShortcuts: "No shortcuts",
    addToShortcuts: "Add to shortcuts",
    removeFromShortcuts: "Remove from shortcuts",
    createSubNotebook: "Create sub-notebook"
  }
} as const;