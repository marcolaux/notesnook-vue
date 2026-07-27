/**
 * Notebook-icons store (headless) — a per-notebook icon overlay stored in
 * `db.settings`, NOT on the `notebooks` table.
 *
 * Upstream Notesnook has no notebook-icon concept at any layer (the `Notebook`
 * type, the `notebooks` SQL table, `db.notebooks.add`, and the sync merger carry
 * only `title`/`description`/`pinned`). We can't add an `icon` column to the
 * `notebooks` table (the schema-driven sanitizer `vendor/…/database/sanitizer.ts`
 * strips any field without a column anyway, and a migration would be a schema
 * change we've ruled out). Instead we keep a single JSON map
 * `Record<notebookId, iconName>` in one `settings` row under the namespaced key
 * `custom:notebookIcons`.
 *
 * Why this is sync-safe and doesn't break stock clients:
 *  - The `settings` table already exists with a free-form `value` text column;
 *    adding a *row* is not a schema change.
 *  - Settings sync through the same opaque-encrypted-blob path as notebooks
 *    (`SYNC_COLLECTIONS_MAP` includes `settingitem`). The server stores/forwards
 *    ciphertext and never inspects fields.
 *  - On download a stock client's sanitizer keeps `key`/`value` (real columns)
 *    and the row sits inert in the settings cache — stock code never calls
 *    `get("custom:notebookIcons")`, so the throw-on-unknown-key branch in the
 *    `Settings` class is never reached. Stock clients simply render no icon.
 *  - The namespaced `custom:` prefix avoids a future collision if upstream ever
 *    ships its own `notebookIcons` key (both would compute the same `makeId`
 *    and clobber each other).
 *
 * Bypass of the typed settings API: the stock `Settings.set`/`get` are private
 * and reject unknown keys, so we write/read the underlying `settings` SQL
 * collection directly (`db.settings.collection`). `SQLCollection.upsert` auto-
 * sets `synced: false` + `dateModified = Date.now()` and preserves `dateCreated`
 * if passed, so the row syncs without us touching `synced`. This uses only
 * stable public surfaces and adds zero vendored-dist maintenance.
 *
 * Last-write-wins: settings sync is whole-row last-write-wins, so concurrent
 * edits on two devices resolve to the later writer's *entire* map. We update by
 * read-modify-write of the full map (not per-notebook rows). For a low-frequency
 * cosmetic setting this is fine.
 *
 * Icon names are kebab Lucide names from the `ICONS` registry in
 * `@notesnook-vue/ui-vue`; the sidebar renders them via `<Icon name=…>` with a
 * `book` fallback when a notebook has no entry.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { makeId, type SettingItem } from "@notesnook-vue/contracts";
import { ICONS, loadAllIcons } from "@notesnook-vue/ui-vue";
import { logger } from "@/utils/logger";

/** Synced settings key holding the notebook→icon map (namespaced to avoid a
 *  future upstream collision). */
const SETTINGS_KEY = "custom:notebookIcons";
/** Deterministic row id — every device computes the same id for this key. */
const ROW_ID = makeId(SETTINGS_KEY);

/** Debounce delay for writes (coalesce rapid set/remove). */
const SAVE_DEBOUNCE_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePending = false;

export const useNotebookIconsStore = defineStore("notebookIcons", () => {
  /** notebookId → kebab Lucide icon name. Reactive; `NotebookNode` reads this
   *  and falls back to `book` when an id is absent. */
  const icons = ref<Record<string, string>>({});

  /**
   * Read the persisted icon map from db.settings. Never throws — a failure
   * leaves the empty map in place (every notebook falls back to `book`). Call
   * once at boot after the db is up; safe to call again to refresh after a
   * remote sync pulls a newer map (the sidebar re-renders from the ref).
   */
  async function load(): Promise<void> {
    try {
      const item = getDatabase().settings.collection.get(ROW_ID);
      if (item && typeof item.value === "string") {
        const parsed = JSON.parse(item.value) as unknown;
        if (parsed && typeof parsed === "object") {
          icons.value = parsed as Record<string, string>;
        }
      }
      // If any stored icon isn't in the static curated set, lazy-load the full
      // Lucide set (separate chunk) so `<Icon>` can render it. Curated-only
      // maps (or no icons) pay no fetch cost.
      if (Object.values(icons.value).some((name) => !ICONS[name])) {
        void loadAllIcons();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[notebook-icons] load failed:", e);
    }
  }

  /** Persist the current map to db.settings (one settings row). `upsert` auto-
   *  sets `synced:false` + `dateModified:now`; we pass the existing
   *  `dateCreated` so creation time survives across edits. The `key` field is
   *  cast because our namespaced key isn't in upstream's `SettingItemMap` —
   *  this is the deliberate bypass. Never throws. */
  async function flushSave(): Promise<void> {
    if (!savePending) return;
    savePending = false;
    try {
      const db = getDatabase();
      const old = db.settings.collection.get(ROW_ID);
      await db.settings.collection.upsert({
        id: ROW_ID,
        // Custom namespaced key; not in SettingItemMap, so cast (bypass path).
        key: SETTINGS_KEY as SettingItem["key"],
        value: JSON.stringify(icons.value),
        type: "settingitem",
        // upsert overwrites dateModified with now; dateCreated is preserved.
        dateCreated: old?.dateCreated ?? Date.now(),
        dateModified: Date.now()
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[notebook-icons] save failed:", e);
    }
  }

  function scheduleSave(): void {
    savePending = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Set a notebook's icon (read-modify-write of the whole map). Updates the
   *  ref immediately so the sidebar reflects it without waiting on the write. */
  function setIcon(id: string, name: string): void {
    if (!id) return;
    icons.value = { ...icons.value, [id]: name };
    scheduleSave();
  }

  /** Remove a notebook's icon (reverts to the `book` fallback). */
  function removeIcon(id: string): void {
    if (!id || !(id in icons.value)) return;
    const next = { ...icons.value };
    delete next[id];
    icons.value = next;
    scheduleSave();
  }

  /** Flush any pending debounced write immediately (used on quit / account
   *  switch so the last edit isn't lost). */
  function saveNow(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    void flushSave();
  }

  return { icons, load, setIcon, removeIcon, saveNow };
});