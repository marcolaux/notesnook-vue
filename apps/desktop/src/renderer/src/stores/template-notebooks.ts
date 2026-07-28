/**
 * Template-notebooks store (headless) — a per-template "notebook on creation"
 * policy stored in `db.settings`, NOT on the notes/notebooks tables.
 *
 * A template is just a note tagged "template" (see `stores/templates.ts`), and
 * upstream Notesnook has no per-template-metadata concept at any layer. We can't
 * add a column to the `notes` table (the schema-driven sanitizer strips any
 * field without a column, and a migration would be a schema change we've ruled
 * out). Instead we keep a single JSON map
 * `Record<templateId, { mode, notebookId }>` in one `settings` row under the
 * namespaced key `custom:templateNotebook`.
 *
 * Why this is sync-safe and doesn't break stock clients — same reasoning as the
 * sibling `notebook-icons` store (see that file for the full justification):
 *  - Adding a *row* to the existing `settings` table is not a schema change.
 *  - Settings sync through the same opaque-encrypted-blob path as notebooks
 *    (`SYNC_COLLECTIONS_MAP` includes `settingitem`). The server stores/
 *    forwards ciphertext and never inspects fields.
 *  - On download a stock client's sanitizer keeps `key`/`value` (real columns)
 *    and the row sits inert — stock code never calls `get("custom:templateNotebook")`,
 *    so the throw-on-unknown-key branch in the `Settings` class is never reached.
 *    Stock clients simply use the default (no policy) behavior.
 *  - The namespaced `custom:` prefix avoids a future collision if upstream ever
 *    ships its own `templateNotebook` key.
 *
 * Bypass of the typed settings API: the stock `Settings.set`/`get` are private
 * and reject unknown keys, so we write/read the underlying `settings` SQL
 * collection directly (`db.settings.collection`). `SQLCollection.upsert` auto-
 * sets `synced: false` + `dateModified = Date.now()` and preserves `dateCreated`
 * if passed, so the row syncs without us touching `synced`.
 *
 * Last-write-wins: settings sync is whole-row last-write-wins, so concurrent
 * edits on two devices resolve to the later writer's *entire* map. We update by
 * read-modify-write of the full map. For a low-frequency per-template setting
 * this is fine.
 *
 * `mode`:
 *  - "none"  — default; the new note follows the active sidebar filter (current
 *              behavior). Also the fallback when a template has no entry.
 *  - "ask"   — `notes.create` shows the notebook picker (`useNotebookPickerStore`)
 *              before creating the note; the chosen notebook is assigned.
 *  - "fixed" — the new note is always filed into `notebookId`, overriding the
 *              active sidebar filter's notebook branch.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { makeId, type SettingItem } from "@notesnook-vue/contracts";
import { logger } from "@/utils/logger";

/** Synced settings key holding the template→policy map (namespaced to avoid a
 *  future upstream collision). */
const SETTINGS_KEY = "custom:templateNotebook";
/** Deterministic row id — every device computes the same id for this key. */
const ROW_ID = makeId(SETTINGS_KEY);

/** Debounce delay for writes (coalesce rapid set/clear). */
const SAVE_DEBOUNCE_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePending = false;

export type TemplateNotebookMode = "none" | "ask" | "fixed";

export interface TemplateNotebookPolicy {
  mode: TemplateNotebookMode;
  /** Notebook to file into. Only meaningful when `mode === "fixed"`;
   *  `null`/`undefined` means "no fixed notebook". */
  notebookId: string | null;
}

/** A leading "none" entry is synthesized for templates with no stored policy so
 *  callers can treat `getPolicy` as always-defined. */
const NONE_POLICY: TemplateNotebookPolicy = { mode: "none", notebookId: null };

function isPolicy(v: unknown): v is TemplateNotebookPolicy {
  if (!v || typeof v !== "object") return false;
  const mode = (v as { mode?: unknown }).mode;
  return mode === "none" || mode === "ask" || mode === "fixed";
}

export const useTemplateNotebooksStore = defineStore("templateNotebooks", () => {
  /** templateId → policy. Reactive; `notes.create` + the settings UI read this. */
  const policies = ref<Record<string, TemplateNotebookPolicy>>({});

  /**
   * Read the persisted policy map from db.settings. Never throws — a failure
   * leaves the empty map in place (every template falls back to "none"). Call
   * once at boot after the db is up; safe to call again to refresh after a
   * remote sync pulls a newer map.
   */
  async function load(): Promise<void> {
    try {
      const item = getDatabase().settings.collection.get(ROW_ID);
      if (item && typeof item.value === "string") {
        const parsed = JSON.parse(item.value) as unknown;
        if (parsed && typeof parsed === "object") {
          const next: Record<string, TemplateNotebookPolicy> = {};
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (isPolicy(v)) {
              next[k] = {
                mode: v.mode,
                notebookId: typeof v.notebookId === "string" ? v.notebookId : null
              };
            }
          }
          policies.value = next;
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[template-notebooks] load failed:", e);
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
        value: JSON.stringify(policies.value),
        type: "settingitem",
        // upsert overwrites dateModified with now; dateCreated is preserved.
        dateCreated: old?.dateCreated ?? Date.now(),
        dateModified: Date.now()
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      logger.error("[template-notebooks] save failed:", e);
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

  /** Get a template's policy. Returns a "none" policy (live reference is fine
   *  since `mode:"none"` carries no notebook) when the template has no entry, so
   *  callers never need a null-check. */
  function getPolicy(templateId: string): TemplateNotebookPolicy {
    return policies.value[templateId] ?? NONE_POLICY;
  }

  /** Set a template's policy (read-modify-write of the whole map). Updates the
   *  ref immediately so the UI reflects it without waiting on the write. A
   *  `mode:"none"` policy writes the entry too (so a deliberate revert is
   *  synced); use {@link clearPolicy} to delete the entry outright. */
  function setPolicy(templateId: string, policy: TemplateNotebookPolicy): void {
    if (!templateId) return;
    policies.value = { ...policies.value, [templateId]: policy };
    scheduleSave();
  }

  /** Remove a template's entry (revert to the "none" default, drop the key). */
  function clearPolicy(templateId: string): void {
    if (!templateId || !(templateId in policies.value)) return;
    const next = { ...policies.value };
    delete next[templateId];
    policies.value = next;
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

  return { policies, load, getPolicy, setPolicy, clearPolicy, saveNow };
});