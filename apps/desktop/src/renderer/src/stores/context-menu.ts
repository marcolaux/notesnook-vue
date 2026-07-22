/**
 * Context-menu store (headless) — the open/position/active-row state for the
 * right-click `ContextMenu.vue` overlay. Mirrors the command-palette store
 * shape: the overlay renders `items` and binds its keys to `move`/`execute`,
 * mouse hover/click to `setActiveIndex`/`hoverRoot`.
 *
 * The menu entries (actions + separators, and v2 submenu specs) are built where
 * the right-click happens (NotesList / NotebookNode / Sidebar) via the builders
 * in `utils/context-menu-entries.ts`, then passed to `show(items, x, y)`. The
 * store owns NO domain logic — it is pure UI state — so it stays trivially
 * testable (no db, no stores).
 *
 * v2 submenu state: at most ONE submenu is open at a time (no nested submenus —
 * submenu items are always leaf actions). `submenu` holds the open submenu's
 * spec + its (query-filtered) items + active row + query. `openSubmenu(i)`
 * builds the submenu via `spec.build("")`; `setQuery(q)` rebuilds on search
 * input; `refreshSubmenu()` rebuilds after a `keepOpen` toggle so checkmarks
 * flip live. Keyboard nav uses ArrowRight/ArrowLeft to enter/leave the submenu.
 *
 * `ContextMenu.vue` is mounted once in `App.vue`; `show` teleports the overlay
 * to `<body>` at `(x, y)` (the raw `contextmenu` event coords), and the overlay
 * clamps the position into the viewport itself (it knows its own size).
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  cycleMenuIndex,
  firstMenuIndex,
  type MenuItem,
  type SubmenuSpec
} from "@/utils/context-menu";

/** The open submenu's UI state (v2). `items` is the query-filtered view; the
 *  store rebuilds it from `spec.build(query)` on open, on query change, and on
 *  `refreshSubmenu` (after a `keepOpen` toggle). */
export interface SubmenuState {
  spec: SubmenuSpec;
  items: MenuItem[];
  activeIndex: number;
  query: string;
}

export const useContextMenuStore = defineStore("contextMenu", () => {
  /** Whether the overlay is open. */
  const open = ref(false);
  /** The entries for the current root menu (empty when closed). */
  const items = ref<MenuItem[]>([]);
  /** Desired top-left (raw cursor coords; the overlay clamps into the viewport). */
  const x = ref(0);
  const y = ref(0);
  /** Active row index in the root menu (for keyboard nav + hover highlight). */
  const activeIndex = ref(0);
  /** The currently-open submenu, or `null` (v2). At most one at a time. */
  const submenu = ref<SubmenuState | null>(null);

  /** The selectable (non-separator, non-disabled) root entries — for the
   *  overlay's keyboard nav + to short-circuit `execute` when there is nothing. */
  const selectableItems = computed<MenuItem[]>(() =>
    items.value.filter((i) => !i.separator && !i.disabled)
  );

  /** The submenu's current items (empty when no submenu open) — for the overlay. */
  const submenuItems = computed<MenuItem[]>(() => submenu.value?.items ?? []);

  /** Open a menu at the given cursor coords. Resets the active row to the first
   *  selectable entry + closes any open submenu. Replacing an already-open
   *  menu closes it first. */
  function show(nextItems: readonly MenuItem[], px: number, py: number): void {
    items.value = [...nextItems];
    x.value = px;
    y.value = py;
    activeIndex.value = firstMenuIndex(items.value);
    submenu.value = null;
    open.value = true;
  }

  function close(): void {
    open.value = false;
    submenu.value = null;
    // Keep `items` until the next `show` so a closing overlay can finish its
    // exit without a flash of empty content; `show` overwrites them.
  }

  /** Build + open the submenu attached to the root item at index `i` (v2). If
   *  the item has no `submenu`, any open submenu is closed (so hovering a plain
   *  root row while a submenu is open dismisses it, OS-menu style). No-op when
   *  the menu is closed or the index is out of range. */
  function openSubmenu(i: number): void {
    if (!open.value) return;
    const item = items.value[i];
    if (!item || !item.submenu) {
      submenu.value = null;
      return;
    }
    const built = item.submenu.build("");
    submenu.value = {
      spec: item.submenu,
      items: built,
      activeIndex: firstMenuIndex(built),
      query: ""
    };
  }

  /** Close the open submenu (ArrowLeft), leaving the root menu open. */
  function closeSubmenu(): void {
    submenu.value = null;
  }

  /** Set the submenu search query + rebuild its items (v2). No-op when no
   *  submenu is open or the submenu has no search field. Resets the active row
   *  to the first selectable entry of the rebuilt list. */
  function setQuery(q: string): void {
    const sub = submenu.value;
    if (!sub || !sub.spec.search) return;
    const items2 = sub.spec.build(q);
    submenu.value = {
      ...sub,
      query: q,
      items: items2,
      activeIndex: firstMenuIndex(items2)
    };
  }

  /** Rebuild the submenu's items from the current query (v2). Used after a
   *  `keepOpen` toggle so the checkmarks update without reopening. Keeps the
   *  active row clamped to the rebuilt list. No-op when no submenu is open. */
  function refreshSubmenu(): void {
    const sub = submenu.value;
    if (!sub) return;
    const items2 = sub.spec.build(sub.query);
    const n = items2.length;
    const clamped = n === 0 ? 0 : Math.min(Math.max(sub.activeIndex, 0), n - 1);
    submenu.value = { ...sub, items: items2, activeIndex: clamped };
  }

  /** Root-row hover: set the root active index + open/close the submenu to
   *  match the hovered item (v2). Moving the mouse across root rows swaps the
   *  open submenu, OS-menu style. */
  function hoverRoot(i: number): void {
    setActiveIndex(i);
    openSubmenu(i);
  }

  /** Submenu-row hover: set the submenu's active index (v2). Clamped to the
   *  submenu list; no-op when no submenu is open. */
  function hoverSubmenu(i: number): void {
    const sub = submenu.value;
    if (!sub) return;
    const n = sub.items.length;
    submenu.value = { ...sub, activeIndex: n === 0 ? 0 : Math.min(Math.max(i, 0), n - 1) };
  }

  /** Move the active row down (dir = 1) or up (dir = -1), wrapping at the ends.
   *  Operates on the deepest open level — the submenu when one is open, else the
   *  root menu (v2). */
  function move(dir: 1 | -1): void {
    const sub = submenu.value;
    if (sub) {
      submenu.value = { ...sub, activeIndex: cycleMenuIndex(sub.activeIndex, sub.items, dir) };
      return;
    }
    activeIndex.value = cycleMenuIndex(activeIndex.value, items.value, dir);
  }

  /** Set the active row directly (mouse hover/click on the root menu). Clamped
   *  to the root list (back-compat for the v1 mouse path). */
  function setActiveIndex(index: number): void {
    const n = items.value.length;
    if (n === 0) {
      activeIndex.value = 0;
      return;
    }
    activeIndex.value = Math.min(Math.max(index, 0), n - 1);
  }

  /** Run the active entry's `onSelect` (if any) and close — unless the entry has
   *  `keepOpen`, in which case the menu stays open and the submenu is rebuilt so
   *  checkmarks update (v2). On the root level, a submenu-parent active row
   *  opens its submenu instead of running `onSelect`. A separator/disabled row
   *  is a no-op (but still closes when not `keepOpen`). Called by Enter or click. */
  async function execute(): Promise<void> {
    const sub = submenu.value;
    if (sub) {
      const item = sub.items[sub.activeIndex];
      if (!item || item.separator || item.disabled || !item.onSelect) return;
      if (item.keepOpen) {
        await item.onSelect();
        refreshSubmenu();
        return;
      }
      close();
      await item.onSelect();
      return;
    }
    const item = items.value[activeIndex.value];
    if (!item || item.separator || item.disabled) {
      close();
      return;
    }
    // A root submenu-parent row opens its submenu on Enter/click instead of
    // running an onSelect (there is none).
    if (item.submenu) {
      openSubmenu(activeIndex.value);
      return;
    }
    if (!item.onSelect) return;
    if (item.keepOpen) {
      await item.onSelect();
      return;
    }
    close();
    await item.onSelect();
  }

  return {
    open,
    items,
    x,
    y,
    activeIndex,
    submenu,
    selectableItems,
    submenuItems,
    show,
    close,
    move,
    setActiveIndex,
    openSubmenu,
    closeSubmenu,
    setQuery,
    refreshSubmenu,
    hoverRoot,
    hoverSubmenu,
    execute
  };
});