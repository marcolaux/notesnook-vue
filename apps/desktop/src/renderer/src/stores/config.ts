import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Config store (Phase 2) — the **client-only** settings layer: reactive,
 * localStorage-backed toggles + values that are NOT synced through
 * `db.settings` (those live in the {@link useSettingsStore}). This mirrors
 * upstream's browser `Config` facade (`apps/web/src/utils/config.ts`), which
 * stores the sync/backup/behaviour/editor preferences in `localStorage` per
 * device. Because these are local-only, there is no DB-model constraint here —
 * we are free to namespace them — but the key *names* match upstream's so a
 * future shared-config migration stays legible.
 *
 * All keys are prefixed `notesnook.config.` (same family as `notesnook.themeMode`
 * / `notesnook.currentContext`) to avoid colliding with other same-origin
 * localStorage users. Upstream's unprefixed names are kept verbatim after the
 * prefix.
 *
 * Defaults follow upstream's `app-store` / `setting-store`:
 *  - sync: `syncEnabled`/`autoSyncEnabled`/`isRealtimeSyncEnabled` = true,
 *    `fullOfflineMode` = false.
 *  - backup: `encryptBackups` = false, `backupReminderOffset` /
 *    `fullBackupReminderOffset` = 0 (never).
 *  - editor/behaviour (consumed by Phase 4 sections): `doubleSpacedLines` =
 *    true, `markdownShortcuts`/`fontLigatures`/`hideNoteTitle` = false,
 *    `homepage` = `{type:"route",id:"notes"}`, `imageCompression` = 0 (ask).
 *
 * `privacyMode` is NOT here — upstream persists it main-side (desktop
 * `config.json`), not in localStorage; it moves to a Behaviour toggle with a
 * main-process bridge in a later phase.
 *
 * Behaviour wiring (the toggle actually doing something) is incremental:
 *  - `syncEnabled` / `fullOfflineMode` are wired now (Phase 2 Sync section +
 *    `App.vue` boot sync gate).
 *  - `autoSyncEnabled` gates the post-login auto-sync in `App.vue` (wired now).
 *  - `isRealtimeSyncEnabled` needs core's realtime/SSE hookup — stored now,
 *    wired in a later phase (the toggle is not shown until it does something).
 *  - backup reminder offsets drive the auto-backup scheduler (later phase).
 *  - editor/behaviour toggles drive the editor + sidebar (Phase 4).
 */

/** localStorage key prefix for every config value (namespaced per device). */
export const CONFIG_PREFIX = "notesnook.config.";

/** Homepage descriptor (upstream `HomePage`). */
export interface HomePage {
  type: "notebook" | "tag" | "color" | "route";
  id: string;
}

/** Image-compression preference (upstream web-app enum; not in vendored core).
 *  Mirrors upstream's `ImageCompressionOptions`. */
export enum ImageCompressionOptions {
  /** Ask each time an image is pasted/dropped (upstream default). */
  ASK_EVERY_TIME = 0,
  /** Compress all pasted/dropped images. */
  ENABLE = 1,
  /** Never compress; keep originals. */
  DISABLE = 2
}

/** The known config keys (the suffix after {@link CONFIG_PREFIX}). */
export type ConfigKey =
  | "syncEnabled"
  | "autoSyncEnabled"
  | "isRealtimeSyncEnabled"
  | "fullOfflineMode"
  | "encryptBackups"
  | "backupReminderOffset"
  | "fullBackupReminderOffset"
  | "doubleSpacedLines"
  | "markdownShortcuts"
  | "fontLigatures"
  | "hideNoteTitle"
  | "homepage"
  | "imageCompression"
  | "defaultNoteTemplate"
  | "defaultTaskTemplate"
  | "tocMode";

/** ToC/Minimap right-sidebar mode (local-only preference — the last-used mode
 *  is seeded when a tab opens its ToC sidebar). */
export type TocMode = "toc" | "minimap";

/** Default value for each config key (matches upstream's stores). */
export const CONFIG_DEFAULTS: {
  syncEnabled: boolean;
  autoSyncEnabled: boolean;
  isRealtimeSyncEnabled: boolean;
  fullOfflineMode: boolean;
  encryptBackups: boolean;
  backupReminderOffset: number;
  fullBackupReminderOffset: number;
  doubleSpacedLines: boolean;
  markdownShortcuts: boolean;
  fontLigatures: boolean;
  hideNoteTitle: boolean;
  homepage: HomePage;
  imageCompression: ImageCompressionOptions;
  /** Template note id applied to every "New note", or `null` for a blank note.
   *  Local-only preference (the template notes themselves sync via db). */
  defaultNoteTemplate: string | null;
  /** Template note id applied to every "New task", or `null` for the task seed.
   *  Local-only preference. */
  defaultTaskTemplate: string | null;
  /** Last-used ToC/Minimap sidebar mode (seeded when a tab opens its sidebar).
   *  Local-only preference. */
  tocMode: TocMode;
} = {
  syncEnabled: true,
  autoSyncEnabled: true,
  isRealtimeSyncEnabled: true,
  fullOfflineMode: false,
  encryptBackups: false,
  backupReminderOffset: 0,
  fullBackupReminderOffset: 0,
  doubleSpacedLines: true,
  markdownShortcuts: false,
  fontLigatures: false,
  hideNoteTitle: false,
  homepage: { type: "route", id: "notes" },
  imageCompression: ImageCompressionOptions.ASK_EVERY_TIME,
  defaultNoteTemplate: null,
  defaultTaskTemplate: null,
  tocMode: "toc"
};

/** Build the full localStorage key for a config suffix. */
export function configKey(suffix: ConfigKey): string {
  return CONFIG_PREFIX + suffix;
}

/** Read + parse a config value, falling back to its default. Best-effort: a
 *  parse failure or unavailable localStorage returns the default. */
function readConfig<T>(suffix: ConfigKey, fallback: T): T {
  try {
    const raw = localStorage.getItem(configKey(suffix));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write a config value as JSON. Best-effort: a write failure is swallowed. */
function writeConfig<T>(suffix: ConfigKey, value: T): void {
  try {
    localStorage.setItem(configKey(suffix), JSON.stringify(value));
  } catch {
    /* best-effort — persistence is optional */
  }
}

export const useConfigStore = defineStore("config", () => {
  // --- sync ------------------------------------------------------------------
  const syncEnabled = ref(readConfig("syncEnabled", CONFIG_DEFAULTS.syncEnabled));
  const autoSyncEnabled = ref(readConfig("autoSyncEnabled", CONFIG_DEFAULTS.autoSyncEnabled));
  const isRealtimeSyncEnabled = ref(
    readConfig("isRealtimeSyncEnabled", CONFIG_DEFAULTS.isRealtimeSyncEnabled)
  );
  const fullOfflineMode = ref(readConfig("fullOfflineMode", CONFIG_DEFAULTS.fullOfflineMode));

  // --- backup ----------------------------------------------------------------
  const encryptBackups = ref(readConfig("encryptBackups", CONFIG_DEFAULTS.encryptBackups));
  const backupReminderOffset = ref(
    readConfig("backupReminderOffset", CONFIG_DEFAULTS.backupReminderOffset)
  );
  const fullBackupReminderOffset = ref(
    readConfig("fullBackupReminderOffset", CONFIG_DEFAULTS.fullBackupReminderOffset)
  );

  // --- editor / behaviour (Phase 4 consumers) ---------------------------------
  const doubleSpacedLines = ref(
    readConfig("doubleSpacedLines", CONFIG_DEFAULTS.doubleSpacedLines)
  );
  const markdownShortcuts = ref(
    readConfig("markdownShortcuts", CONFIG_DEFAULTS.markdownShortcuts)
  );
  const fontLigatures = ref(readConfig("fontLigatures", CONFIG_DEFAULTS.fontLigatures));
  const hideNoteTitle = ref(readConfig("hideNoteTitle", CONFIG_DEFAULTS.hideNoteTitle));
  const homepage = ref(readConfig("homepage", CONFIG_DEFAULTS.homepage));
  const imageCompression = ref(
    readConfig("imageCompression", CONFIG_DEFAULTS.imageCompression)
  );

  // --- templates (default note/task template note id; null = none) ----------
  const defaultNoteTemplate = ref(
    readConfig("defaultNoteTemplate", CONFIG_DEFAULTS.defaultNoteTemplate)
  );
  const defaultTaskTemplate = ref(
    readConfig("defaultTaskTemplate", CONFIG_DEFAULTS.defaultTaskTemplate)
  );

  // --- ToC/Minimap sidebar mode (last-used; seeded when a tab opens its sidebar)
  const tocMode = ref<TocMode>(readConfig("tocMode", CONFIG_DEFAULTS.tocMode));

  /** Re-read every config value from localStorage (e.g. after another window
   *  changed one via the `storage` event, or after a logout/clear). */
  function load(): void {
    syncEnabled.value = readConfig("syncEnabled", CONFIG_DEFAULTS.syncEnabled);
    autoSyncEnabled.value = readConfig("autoSyncEnabled", CONFIG_DEFAULTS.autoSyncEnabled);
    isRealtimeSyncEnabled.value = readConfig(
      "isRealtimeSyncEnabled",
      CONFIG_DEFAULTS.isRealtimeSyncEnabled
    );
    fullOfflineMode.value = readConfig("fullOfflineMode", CONFIG_DEFAULTS.fullOfflineMode);
    encryptBackups.value = readConfig("encryptBackups", CONFIG_DEFAULTS.encryptBackups);
    backupReminderOffset.value = readConfig(
      "backupReminderOffset",
      CONFIG_DEFAULTS.backupReminderOffset
    );
    fullBackupReminderOffset.value = readConfig(
      "fullBackupReminderOffset",
      CONFIG_DEFAULTS.fullBackupReminderOffset
    );
    doubleSpacedLines.value = readConfig(
      "doubleSpacedLines",
      CONFIG_DEFAULTS.doubleSpacedLines
    );
    markdownShortcuts.value = readConfig(
      "markdownShortcuts",
      CONFIG_DEFAULTS.markdownShortcuts
    );
    fontLigatures.value = readConfig("fontLigatures", CONFIG_DEFAULTS.fontLigatures);
    hideNoteTitle.value = readConfig("hideNoteTitle", CONFIG_DEFAULTS.hideNoteTitle);
    homepage.value = readConfig("homepage", CONFIG_DEFAULTS.homepage);
    imageCompression.value = readConfig(
      "imageCompression",
      CONFIG_DEFAULTS.imageCompression
    );
    defaultNoteTemplate.value = readConfig(
      "defaultNoteTemplate",
      CONFIG_DEFAULTS.defaultNoteTemplate
    );
    defaultTaskTemplate.value = readConfig(
      "defaultTaskTemplate",
      CONFIG_DEFAULTS.defaultTaskTemplate
    );
    tocMode.value = readConfig("tocMode", CONFIG_DEFAULTS.tocMode);
  }

  // --- setters (write-through: persist + update the reactive ref) ------------
  function setSyncEnabled(v: boolean): void {
    syncEnabled.value = v;
    writeConfig("syncEnabled", v);
  }
  function setAutoSyncEnabled(v: boolean): void {
    autoSyncEnabled.value = v;
    writeConfig("autoSyncEnabled", v);
  }
  function setRealtimeSyncEnabled(v: boolean): void {
    isRealtimeSyncEnabled.value = v;
    writeConfig("isRealtimeSyncEnabled", v);
  }
  function setFullOfflineMode(v: boolean): void {
    fullOfflineMode.value = v;
    writeConfig("fullOfflineMode", v);
  }
  function setEncryptBackups(v: boolean): void {
    encryptBackups.value = v;
    writeConfig("encryptBackups", v);
  }
  function setBackupReminderOffset(v: number): void {
    backupReminderOffset.value = v;
    writeConfig("backupReminderOffset", v);
  }
  function setFullBackupReminderOffset(v: number): void {
    fullBackupReminderOffset.value = v;
    writeConfig("fullBackupReminderOffset", v);
  }
  function setDoubleSpacedLines(v: boolean): void {
    doubleSpacedLines.value = v;
    writeConfig("doubleSpacedLines", v);
  }
  function setMarkdownShortcuts(v: boolean): void {
    markdownShortcuts.value = v;
    writeConfig("markdownShortcuts", v);
  }
  function setFontLigatures(v: boolean): void {
    fontLigatures.value = v;
    writeConfig("fontLigatures", v);
  }
  function setHideNoteTitle(v: boolean): void {
    hideNoteTitle.value = v;
    writeConfig("hideNoteTitle", v);
  }
  function setHomepage(v: HomePage): void {
    homepage.value = v;
    writeConfig("homepage", v);
  }
  function setImageCompression(v: ImageCompressionOptions): void {
    imageCompression.value = v;
    writeConfig("imageCompression", v);
  }
  function setDefaultNoteTemplate(v: string | null): void {
    defaultNoteTemplate.value = v;
    writeConfig("defaultNoteTemplate", v);
  }
  function setDefaultTaskTemplate(v: string | null): void {
    defaultTaskTemplate.value = v;
    writeConfig("defaultTaskTemplate", v);
  }
  function setTocMode(v: TocMode): void {
    tocMode.value = v;
    writeConfig("tocMode", v);
  }

  return {
    // sync
    syncEnabled,
    autoSyncEnabled,
    isRealtimeSyncEnabled,
    fullOfflineMode,
    // backup
    encryptBackups,
    backupReminderOffset,
    fullBackupReminderOffset,
    // editor / behaviour
    doubleSpacedLines,
    markdownShortcuts,
    fontLigatures,
    hideNoteTitle,
    homepage,
    imageCompression,
    defaultNoteTemplate,
    defaultTaskTemplate,
    tocMode,
    // actions
    load,
    setSyncEnabled,
    setAutoSyncEnabled,
    setRealtimeSyncEnabled,
    setFullOfflineMode,
    setEncryptBackups,
    setBackupReminderOffset,
    setFullBackupReminderOffset,
    setDoubleSpacedLines,
    setMarkdownShortcuts,
    setFontLigatures,
    setHideNoteTitle,
    setHomepage,
    setImageCompression,
    setDefaultNoteTemplate,
    setDefaultTaskTemplate,
    setTocMode
  };
});