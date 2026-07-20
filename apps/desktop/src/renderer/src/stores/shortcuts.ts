import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import type { Shortcut, Notebook, Tag } from "@notesnook-vue/contracts";
import {
  buildShortcutInput,
  sortShortcutsByCreated,
  toResolvedShortcut,
  type ResolvedShortcut,
  type ShortcutItemType
} from "@/utils/shortcuts";

/**
 * Shortcuts store (headless) — the sidebar's "Shortcuts" section: pin/unpin
 * notebooks + tags as quick-access shortcuts, backed by `@notesnook/core`'s
 * `db.shortcuts`. A shortcut's `id` equals its `itemId` (core's `add` sets
 * `id = shortcut.id || shortcut.itemId`), so pin/unpin is keyed by item id.
 *
 * Request/response (no event-subscribe, like the reminders / colors stores) →
 * isolated testable. `db.shortcuts.all` is a **synchronous cached** getter
 * (`Shortcut[]`); `db.shortcuts.resolved()` is async and returns the actual
 * `Notebook[]`/`Tag[]` in shortcut (dateCreated) order. `sortIndex` is dead
 * upstream (always `-1`), so there is no reorder — ordering is by `dateCreated`.
 *
 * The sidebar reads `resolved` for the section + `shortcutIds` for the pin
 * active-state; pin/unpin flows through `add`/`remove`/`toggle`. `App.vue`
 * refreshes on boot + showShell + sync-complete. Topics are runtime-allowed by
 * core but not in our vendored TS types / flat sidebar → deferred.
 */

export const useShortcutsStore = defineStore("shortcuts", () => {
  /** All raw shortcuts, dateCreated-ascending (the order `resolved()` yields). */
  const items = ref<Shortcut[]>([]);
  /** The resolved pinned notebooks/tags for the sidebar section. */
  const resolved = ref<ResolvedShortcut[]>([]);
  /** True while the list is being (re)loaded. */
  const loading = ref(false);
  /** True while a pin/unpin mutation is in flight. */
  const busy = ref(false);
  /** Last mutation error message, or `null`. Cleared on success. */
  const lastError = ref<string | null>(null);

  /** Set of pinned item ids — for the pin-toggle active-state on notebook/tag
   *  rows (membership check is O(1)). */
  const shortcutIds = computed(
    () => new Set(items.value.map((s) => s.itemId))
  );

  /** Reload the raw shortcut list + the resolved notebooks/tags. Never throws
   *  — a failure leaves the previous state intact and logs. */
  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      const db = getDatabase();
      // `all` is a synchronous cached getter; `resolved()` is async.
      items.value = sortShortcutsByCreated(db.shortcuts.all);
      const r = await db.shortcuts.resolved();
      resolved.value = (r as Array<Notebook | Tag>).map(toResolvedShortcut);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[shortcuts] refresh failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /** Pin a notebook/tag as a shortcut via `db.shortcuts.add({itemId, itemType})`
   *  (upserts; the shortcut id = the item id), then reload. Returns the id, or
   *  `null` if the call threw (error surfaced via `lastError`). `busy`-gated. */
  async function add(
    itemId: string,
    itemType: ShortcutItemType
  ): Promise<string | null> {
    busy.value = true;
    try {
      const db = getDatabase();
      const id = await db.shortcuts.add(buildShortcutInput({ itemId, itemType }));
      lastError.value = null;
      await refresh();
      return id ?? null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[shortcuts] add failed:", e);
      return null;
    } finally {
      busy.value = false;
    }
  }

  /** Unpin a shortcut by item id (the shortcut id = the item id). Never
   *  throws; no-op if empty. */
  async function remove(itemId: string): Promise<void> {
    if (!itemId) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.shortcuts.remove(itemId);
      lastError.value = null;
      await refresh();
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[shortcuts] remove failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Toggle a shortcut: pin if not already pinned, else unpin. Never throws. */
  async function toggle(
    itemId: string,
    itemType: ShortcutItemType
  ): Promise<void> {
    if (shortcutIds.value.has(itemId)) {
      await remove(itemId);
    } else {
      await add(itemId, itemType);
    }
  }

  /** Is the given item id pinned as a shortcut? Sync, never throws. */
  function isShortcut(itemId: string): boolean {
    return shortcutIds.value.has(itemId);
  }

  return {
    items,
    resolved,
    loading,
    busy,
    lastError,
    shortcutIds,
    refresh,
    add,
    remove,
    toggle,
    isShortcut
  };
});