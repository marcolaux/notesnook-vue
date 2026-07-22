/**
 * Pure context-menu logic (headless) — the data + positioning primitives shared
 * by the {@link useContextMenuStore} Pinia store and the `ContextMenu.vue` overlay.
 * Framework-agnostic so it is unit-tested in isolation (see
 * `tests/contract/context-menu.spec.ts`).
 *
 * A context menu is a list of {@link MenuItem}s (actions + separators). The
 * menu is built where the right-click happens (NotesList / NotebookNode / Sidebar)
 * via the entry builders in `utils/context-menu-entries.ts`; the store just holds
 * the open/position/active-row state and the overlay renders it.
 *
 * v2 adds ONE level of submenu support: an item may carry a {@link SubmenuSpec}
 * (e.g. the note-row Color / Tags / Notebooks entries). The overlay renders the
 * submenu as a second panel to the right of the parent row; keyboard nav uses
 * ArrowRight/ArrowLeft to enter/leave it. Nested submenus (a submenu inside a
 * submenu) are out of scope — the submenu items are always leaf actions — which
 * keeps the overlay + keyboard nav tractable.
 */

/** A viewport rectangle (window or test fixture). */
export interface Viewport {
  width: number;
  height: number;
}

/** Spec for a single nested submenu attached to a {@link MenuItem} (v2). At most
 *  one level deep — the submenu's own items must be leaf actions (no further
 *  `submenu`). When `search` is present the overlay renders a filter `<input>` at
 *  the top of the submenu and re-evaluates `build(query)` as the query changes;
 *  when absent `build` is called once with `""` (a static list). `build` is pure
 *  (no Vue/db) so the store can call it headlessly + the overlay can rebuild on
 *  query change / after a `keepOpen` toggle. */
export interface SubmenuSpec {
  search?: { placeholder: string };
  build: (query: string) => MenuItem[];
}

/** A single menu row — either an action or a separator. Separators carry no
 *  label/onSelect and render as a divider; they are skipped by keyboard nav. */
export interface MenuItem {
  /** Stable id within this menu (for keyed rendering + keyboard nav). */
  id: string;
  /** Visible label (empty for separators). */
  label: string;
  /** Render as a divider instead of an action. */
  separator?: boolean;
  /** Show a leading checkmark (for toggle-style entries, e.g. Pin). */
  checked?: boolean;
  /** Render greyed + non-interactive; skipped by keyboard nav. */
  disabled?: boolean;
  /** Render in the danger colour (destructive actions, e.g. Delete). */
  danger?: boolean;
  /** A leading colour-swatch dot (CSS colour code) rendered in the check
   *  column instead of the `✓` — used by the note-row Color submenu entries.
   *  `checked` still applies (rings/highlights the assigned swatch). */
  color?: string;
  /** A leading icon — a name in the ui-vue icon registry, rendered before the
   *  label. Used by the editor-toolbar dropdowns (headings/alignment). The
   *  check column is left empty when an icon is present (a row shows either an
   *  icon, a colour swatch, a `✓`, or nothing). */
  icon?: string;
  /** Open a nested submenu instead of running `onSelect` (v2). The overlay
   *  renders a `▸` chevron; ArrowRight / hover opens the submenu. Only one
   *  level deep — the submenu's items must not themselves carry `submenu`. */
  submenu?: SubmenuSpec;
  /** Keep the menu open after `onSelect` runs (instead of closing). Used by
   *  multi-select toggle entries (tag/notebook assignment) so the user can
   *  flip several in one open; the store rebuilds the submenu via
   *  `refreshSubmenu` so checkmarks update live. */
  keepOpen?: boolean;
  /** Invoked on click / Enter. Optional (separators have none; submenu parents
   *  open their submenu instead). */
  onSelect?: () => void | Promise<void>;
}

/** Helper to declare a separator inline (keeps the builder call sites tidy). */
export function separator(id: string): MenuItem {
  return { id, label: "", separator: true };
}

/**
 * Clamp a menu's top-left corner into the viewport so it never overflows the
 * right/bottom edge. `x`/`y` are the desired (cursor) coordinates; the menu
 * flips left/up only as far as needed to keep `menuWidth`/`menuHeight` on
 * screen, with a `margin` gutter. Pure + deterministic.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewport: Viewport,
  margin = 8
): { top: number; left: number } {
  const left = x + menuWidth + margin > viewport.width ? Math.max(margin, x - menuWidth) : x;
  const top = y + menuHeight + margin > viewport.height ? Math.max(margin, y - menuHeight) : y;
  return { top, left };
}

/**
 * Cycle the active-row index over the *selectable* entries (non-separator,
 * non-disabled), wrapping at the ends. `dir` is +1 (down) or -1 (up). Returns
 * the new index (a raw index into `items`). When there is nothing selectable
 * returns the current index unchanged.
 */
export function cycleMenuIndex(
  current: number,
  items: readonly MenuItem[],
  dir: 1 | -1
): number {
  const selectable = items
    .map((item, i) => ({ item, i }))
    .filter((e) => !e.item.separator && !e.item.disabled);
  if (selectable.length === 0) return current;
  // Map the current raw index to its position in the selectable list (clamp).
  const pos = Math.max(
    0,
    selectable.findIndex((e) => e.i === current)
  );
  const nextPos = (pos + dir + selectable.length) % selectable.length;
  return selectable[nextPos]!.i;
}

/** First selectable index (for `show`), or `0` when none. */
export function firstMenuIndex(items: readonly MenuItem[]): number {
  const i = items.findIndex((item) => !item.separator && !item.disabled);
  return i === -1 ? 0 : i;
}