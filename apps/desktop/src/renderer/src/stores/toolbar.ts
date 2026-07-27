/**
 * Toolbar store (Phase 5.5) — the persisted, per-account editor-toolbar layout.
 *
 * Holds the 2D `ToolbarDefinition` the `EditorToolbar` renders (groups of
 * action ids, with a nested array = the "more" split-button). The default is
 * editor-vue's `DEFAULT_TOOLBAR`; a user-customised layout (preset `"custom"`)
 * is read from + written to `db.settings.setToolbarConfig("desktop", …)`,
 * mirroring upstream so the layout round-trips through sync with upstream
 * clients (the synced `SettingItemMap` key `toolbarConfig:desktop` is upstream's,
 * NOT ours — we must not invent a new synced key).
 *
 * `@notesnook/common` (which owns `migrateToolbar`/`CURRENT_TOOLBAR_VERSION`) is
 * not a renderer dep, so the version + migration are local: we only ever write
 * `CURRENT_TOOLBAR_VERSION` (2), and there is no legacy renderer toolbar data to
 * migrate. When upstream adds a migration step that matters for us, lift
 * `runMigration` from `vendor/…/packages/common/src/utils/migrate-toolbar.ts`.
 *
 * `save` is debounced (400ms) so rapid customisation writes coalesce; `saveNow`
 * flushes on quit/tab-switch. `load` is called once at boot (App.vue, after the
 * db is up). The stored `config` is validated against the known action ids
 * (`EDITOR_ACTION_BY_ID`): unknown ids (from an older/newer action set) are
 * dropped so a stale config never renders a broken toolbar.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import {
  DEFAULT_TOOLBAR,
  EDITOR_ACTION_BY_ID,
  type ToolbarDefinition
} from "@notesnook-vue/editor-vue";
import type { ToolbarConfig, ToolbarConfigPlatforms } from "@notesnook-vue/contracts";
import { logger } from "@/utils/logger";

/**
 * Mirrors upstream's `CURRENT_TOOLBAR_VERSION` in
 * `@notesnook/common`'s `migrate-toolbar.ts`. We write this on every save; v1
 * performs no migration (no legacy renderer data). Bump + add a migrate step
 * here if a future action-set change requires transforming stored configs.
 */
export const CURRENT_TOOLBAR_VERSION = 2;

/** The desktop platform key (upstream also has mobile/tablet/smallTablet). */
const PLATFORM: ToolbarConfigPlatforms = "desktop";

export type ToolbarPreset = "default" | "minimal" | "custom";

/** Debounce delay for `save` (coalesce rapid customisation writes). */
const SAVE_DEBOUNCE_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: { tools: ToolbarDefinition; preset: ToolbarPreset } | null = null;

/**
 * Validate + normalise a raw stored `config` into a renderable
 * {@link ToolbarDefinition}. Unknown action ids (an older/newer action set
 * left them in the synced config) are dropped; empty groups / nested arrays
 * are dropped. A non-array or empty result falls back to {@link DEFAULT_TOOLBAR}
 * so a corrupt config never renders a blank toolbar. Pure — unit-testable.
 */
export function normalizeToolbarConfig(raw: unknown): ToolbarDefinition {
  if (!Array.isArray(raw)) return DEFAULT_TOOLBAR;
  const groups: ToolbarDefinition = [];
  for (const group of raw) {
    if (!Array.isArray(group)) continue;
    const items: (string | string[])[] = [];
    for (const item of group) {
      if (typeof item === "string") {
        if (EDITOR_ACTION_BY_ID.has(item)) items.push(item);
      } else if (Array.isArray(item)) {
        // Nested "more" group — keep the known ids; drop the whole nested
        // array if nothing in it survives (an empty "more" button is useless).
        const nested = item.filter(
          (id): id is string => typeof id === "string" && EDITOR_ACTION_BY_ID.has(id)
        );
        if (nested.length > 0) items.push(nested);
      }
    }
    if (items.length > 0) groups.push(items);
  }
  return groups.length > 0 ? groups : DEFAULT_TOOLBAR;
}

export const useToolbarStore = defineStore("toolbar", () => {
  /** The current toolbar layout (reactive; `EditorToolbar` renders this). */
  const toolbarConfig = ref<ToolbarDefinition>(DEFAULT_TOOLBAR);
  /** The active preset (`"custom"` when the user has customised). */
  const preset = ref<ToolbarPreset>("default");

  /**
   * Read the persisted toolbar config from db.settings. A `custom` preset with
   * a valid `config` wins; anything else (`default`/`minimal`/missing/corrupt)
   * falls back to {@link DEFAULT_TOOLBAR}. Never throws — a failure leaves the
   * default in place. Call once at boot after the db is up.
   */
  async function load(): Promise<void> {
    try {
      const stored = getDatabase().settings.getToolbarConfig(PLATFORM) as
        | ToolbarConfig
        | undefined;
      if (!stored) return;
      const p = (stored.preset as ToolbarPreset) ?? "default";
      if (p === "custom" && Array.isArray(stored.config)) {
        toolbarConfig.value = normalizeToolbarConfig(stored.config);
        preset.value = "custom";
      }
      // `default` / `minimal` / unknown → keep DEFAULT_TOOLBAR (preset stays).
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[toolbar] load failed:", e);
    }
  }

  /** Persist the current config + preset (debounced). Updates the refs
   *  immediately so the UI reflects the change without waiting on the write. */
  function setConfig(tools: ToolbarDefinition, p: ToolbarPreset = "custom"): void {
    toolbarConfig.value = tools;
    preset.value = p;
    scheduleSave(tools, p);
  }

  /** Restore the default preset + persist it. */
  function reset(): void {
    setConfig(DEFAULT_TOOLBAR, "default");
  }

  function scheduleSave(tools: ToolbarDefinition, p: ToolbarPreset): void {
    pendingSave = { tools, preset: p };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  async function flushSave(): Promise<void> {
    const job = pendingSave;
    pendingSave = null;
    if (!job) return;
    try {
      const cfg: ToolbarConfig = {
        version: CURRENT_TOOLBAR_VERSION,
        preset: job.preset,
        config: job.tools
      };
      await getDatabase().settings.setToolbarConfig(PLATFORM, cfg);
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[toolbar] save failed:", e);
    }
  }

  /** Flush any pending debounced write immediately (used on quit / account
   *  switch so the last customisation isn't lost). */
  function saveNow(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    void flushSave();
  }

  return { toolbarConfig, preset, load, setConfig, reset, saveNow };
});