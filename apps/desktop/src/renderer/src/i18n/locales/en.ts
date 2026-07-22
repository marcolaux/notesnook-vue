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
    greeting: "Notesnook Vue",
    close: "Close"
  },
  history: {
    title: "Note history",
    empty: "No saved versions yet",
    loading: "Loading history…",
    locked: "Locked",
    initialVersion: "Initial version",
    justNow: "just now",
    restore: "Restore this version",
    restoreConfirm: "Restore this version? Current content will be replaced.",
    showMore: "Show more",
    showLess: "Show less"
  },
  sidebar: {
    notebooks: "Notebooks",
    noNotebooks: "No notebooks",
    tags: "Tags",
    noTags: "No tags",
    colors: "Colors",
    noColors: "No colors",
    shortcuts: "Shortcuts",
    noShortcuts: "No shortcuts",
    addToShortcuts: "Add to shortcuts",
    removeFromShortcuts: "Remove from shortcuts",
    removeFromFavourites: "Remove from favourites",
    createSubNotebook: "Create sub-notebook",
    resetManualOrder: "Reset manual order",
    setIcon: "Set icon",
    removeIcon: "Remove icon",
    chooseIcon: "Choose notebook icon"
  },
  attachments: {
    previewTitle: "Attachment",
    openExternally: "Open externally",
    unsupportedPreview: "No in-app preview for this file type."
  }
} as const;