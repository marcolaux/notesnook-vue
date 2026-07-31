/**
 * Icon registry — a small static curated set (tree-shakeable, in the main
 * bundle) PLUS a lazy full Lucide set (loaded on demand into a separate chunk).
 *
 * `Icon.vue` resolves names via `getIcon`, which checks the static set first
 * then the lazy full set (a `shallowRef`, so `<Icon>`'s `computed` re-evaluates
 * when the full set loads — icons pop in without a remount).
 *
 * Why two layers:
 *  - App chrome (sidebar, toolbar, menus) uses ~48 specific icons at first
 *    paint — those are static named imports here, tree-shaken into the main
 *    bundle so they render immediately with no async fetch.
 *  - The notebook-icon picker offers the ENTIRE Lucide set (~580 icons,
 *    ~1.1 MB). That set is built in `./icon-registry-full.ts`, which is only
 *    dynamically imported (`loadAllIcons`), so the bundler puts it in a
 *    separate lazy chunk fetched only when the picker opens (or when a stored
 *    notebook icon needs a glyph outside the curated set).
 *
 * Naming: kebab-case of the Lucide component, KEEP trailing digits (`trash-2`,
 * `undo-2`, `file-code-2`). The static names here are a subset of the full set's
 * keys (same `toKebab` rule), so a name resolves identically whether the full
 * set is loaded or not.
 */
import type { Component } from "vue";
import { computed, shallowRef } from "vue";
import {
  // navigation / chrome
  PanelLeft,
  PanelRight,
  Focus,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  // collections
  Book,
  Hash,
  Star,
  Pin,
  // actions
  X,
  Plus,
  Check,
  Ellipsis,
  Search,
  // content / files
  List,
  ListOrdered,
  ListChecks,
  ListTree,
  FileText,
  File,
  FileCode2,
  Image,
  Video,
  AudioLines,
  Film,
  Table2,
  Quote,
  Minus,
  // editor formatting
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Subscript,
  Superscript,
  Highlighter,
  Type,
  RemoveFormatting,
  Undo2,
  Redo2,
  Heading,
  CaseSensitive,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  // misc
  LoaderCircle,
  Trash2,
  ExternalLink,
  Bell,
  // note-history (editor toolbar + HistorySidebar) — chrome, must render at
  // first paint, so static (not left to the lazy full set).
  History,
  Lock,
  RotateCcw,
  // monographs (publish to web) — editor toolbar ⋯ + badge + note context menu,
  // chrome, must render at first paint.
  Globe,
  Link,
  Copy,
  Eye,
  Network,
  // ToC/Minimap right-sidebar header toggle — chrome, must render at first paint.
  Map,
  Rows3,
  // Pane detach grip (Phase 4.6) — tab-strip drag handle, chrome, first paint.
  GripVertical,
  // Block-colorize toolbar toggle (port of sn-super-colors) — chrome, first paint.
  Palette
} from "@lucide/vue";


/**
 * Static curated set — the icons app chrome renders at first paint. Tree-shaken
 * (named imports) into the main bundle. Also serves as the fast path in
 * `getIcon` and the default rendering set before the full set loads. */
export const ICONS: Record<string, Component> = {
  // navigation / chrome
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  focus: Focus,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "chevron-down": ChevronDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "arrow-up-down": ArrowUpDown,
  // collections
  book: Book,
  hash: Hash,
  star: Star,
  pin: Pin,
  // actions
  x: X,
  plus: Plus,
  check: Check,
  ellipsis: Ellipsis,
  search: Search,
  // content / files
  list: List,
  "list-ordered": ListOrdered,
  "list-checks": ListChecks,
  "list-tree": ListTree,
  "file-text": FileText,
  file: File,
  "file-code-2": FileCode2,
  image: Image,
  video: Video,
  "audio-lines": AudioLines,
  film: Film,
  "table-2": Table2,
  quote: Quote,
  minus: Minus,
  // editor formatting
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strikethrough: Strikethrough,
  code: Code,
  subscript: Subscript,
  superscript: Superscript,
  highlighter: Highlighter,
  type: Type,
  "remove-formatting": RemoveFormatting,
  "undo-2": Undo2,
  "redo-2": Redo2,
  palette: Palette,
  heading: Heading,
  "case-sensitive": CaseSensitive,
  "align-left": AlignLeft,
  "align-center": AlignCenter,
  "align-right": AlignRight,
  "align-justify": AlignJustify,
  // misc
  "loader-circle": LoaderCircle,
  "trash-2": Trash2,
  "external-link": ExternalLink,
  bell: Bell,
  // note-history (editor toolbar + HistorySidebar).
  history: History,
  lock: Lock,
  "rotate-ccw": RotateCcw,
  // monographs (publish to web).
  globe: Globe,
  link: Link,
  copy: Copy,
  eye: Eye,
  network: Network,
  // ToC/Minimap right-sidebar header toggle.
  map: Map,
  "rows-3": Rows3,
  // Pane detach grip (Phase 4.6) — tab-strip drag handle.
  "grip-vertical": GripVertical
};

/**
 * The lazy full Lucide set, or `null` until `loadAllIcons()` resolves. A
 * `shallowRef` so `<Icon>`'s `computed(() => getIcon(name))` re-evaluates when
 * it populates — icons outside the curated set pop in without a remount. */
export const fullIcons = shallowRef<Record<string, Component> | null>(null);

/**
 * Icon name union. `string` — the static set is a fixed literal but the full
 * set is runtime-built, so there is no single literal union; `Icon.vue`'s
 * `name` prop is `string` anyway and `MenuItem.icon`/`EditorAction.glyph` are
 * `string`, so no call site is constrained by this type. Kept for export-shape
 * compatibility. */
export type IconName = string;

/** Resolve a name to its Lucide component, or `undefined` if unknown. Checks
 *  the static curated set first, then the lazy full set (if loaded). */
export function getIcon(name: string): Component | undefined {
  return ICONS[name] ?? fullIcons.value?.[name];
}

let allPromise: Promise<void> | null = null;

/**
 * Load the full Lucide set on demand (dynamic import → separate lazy chunk).
 * Idempotent: resolves once the set is built; subsequent calls return the same
 * promise. Safe to call repeatedly. The caller (picker / notebook-icons store)
 * decides when to pay the fetch cost. */
export function loadAllIcons(): Promise<void> {
  if (fullIcons.value) return Promise.resolve();
  if (!allPromise) {
    allPromise = import("./icon-registry-full").then(({ buildAllIcons }) => {
      fullIcons.value = buildAllIcons();
    });
  }
  return allPromise;
}

/**
 * All available icon names (curated static + lazy full set once loaded), for
 * the picker. Reactive — expands from the curated set to the full set when
 * `loadAllIcons()` resolves. Alphabetised. */
export const allIconNames = computed(() => {
  const names = new Set<string>(Object.keys(ICONS));
  if (fullIcons.value) for (const n of Object.keys(fullIcons.value)) names.add(n);
  return [...names].sort();
});