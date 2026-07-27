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
    close: "Close",
    cancel: "Cancel",
    confirm: "Confirm",
    ok: "OK",
    delete: "Delete",
    restore: "Restore",
    all: "All",
    none: "None",
    search: "Search",
    off: "Off",
    on: "On",
    enabled: "Enabled",
    disabled: "Disabled",
    selected: "Selected",
    untitled: "Untitled",
    never: "Never",
    noAdditionalText: "No additional text"
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
  toc: {
    title: "Table of contents",
    headings: "Headings",
    minimap: "Minimap",
    empty: "No headings in this note"
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
    createSubNotebook: "Create sub-notebook",
    createSubTag: "Create sub-tag",
    newNotebook: "New notebook",
    newTag: "New tag",
    newColor: "New color",
    resetManualOrder: "Reset manual order",
    setIcon: "Set icon",
    removeIcon: "Remove icon",
    chooseIcon: "Choose notebook icon"
  },
  attachments: {
    previewTitle: "Attachment",
    openExternally: "Open externally",
    unsupportedPreview: "No in-app preview for this file type."
  },
  linkNote: {
    searchPlaceholder: "Search notes or enter URL…",
    blockSearchPlaceholder: "Search section…",
    linkWholeNote: "Link to whole note",
    backToNotes: "Back to notes",
    noResults: "No notes found",
    noBlocks: "No sections in this note",
    emptyBlock: "(empty)",
    createNote: "Create note",
    notesTab: "Notes",
    webTab: "Web URL",
    fileTab: "Local File",
    webPlaceholder: "https://example.com",
    filePlaceholder: "file:///path/to/file",
    displayTitlePlaceholder: "Display text (optional)",
    browseFile: "Browse file…",
    insertLink: "Insert Link",
    webLinkOption: "Link to web page",
    fileLinkOption: "Link to local file"
  }
} as const;