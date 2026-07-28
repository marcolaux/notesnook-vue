/**
 * Block-colorize store (headless) — the on/off state for the "colorize blocks
 * by type" editor feature (a faithful port of the sn-super-colors Standard Notes
 * theme). Holds a **global default** plus a per-note **override** map; the
 * effective state for a note is `overrides[noteId] ?? default`.
 *
 * Persisted to localStorage (local-only UI preference — consistent with other
 * per-note/per-tab UI prefs like `tocVisible`, which are not synced). Both the
 * main renderer and the separate Settings window import this module; each
 * process keeps its own reactive refs but shares the same localStorage, and a
 * `storage` event listener propagates cross-window writes live (so toggling
 * the global default in Settings re-applies to open editors immediately).
 *
 * The editor-vue extension + host bridge read `effectiveBlockColorize(noteId)`
 * reactively; the toolbar toggle calls `toggleBlockColorize(noteId)`.
 */
import { ref } from "vue";
import { logger } from "@/utils/logger";

const DEFAULT_KEY = "notesnook.blockColorize";
const OVERRIDES_KEY = "notesnook.blockColorizeOverrides";
const DEFAULT_VALUE = false;

function readBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
    return def;
  } catch {
    return def;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch (e) {
    logger.error("[block-colorize] write default failed:", e);
  }
}

function readOverrides(key: string): Record<string, boolean> {
  try {
    const v = localStorage.getItem(key);
    if (!v) return {};
    const parsed = JSON.parse(v) as unknown;
    if (parsed && typeof parsed === "object") {
      const out: Record<string, boolean> = {};
      for (const [k, val] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof val === "boolean") out[k] = val;
      }
      return out;
    }
    return {};
  } catch (e) {
    logger.error("[block-colorize] read overrides failed:", e);
    return {};
  }
}

function writeOverrides(key: string, value: Record<string, boolean>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.error("[block-colorize] write overrides failed:", e);
  }
}

/** Global default (false = colorize off by default). */
export const blockColorizeDefault = ref<boolean>(readBool(DEFAULT_KEY, DEFAULT_VALUE));

/** Per-note overrides: `noteId → enabled`. Absent = fall back to default. */
export const blockColorizeOverrides = ref<Record<string, boolean>>(
  readOverrides(OVERRIDES_KEY)
);

/** Effective on/off state for a note (override if present, else the global
 *  default). A null/undefined noteId (e.g. an unsaved draft) uses the default. */
export function effectiveBlockColorize(
  noteId: string | null | undefined
): boolean {
  if (!noteId) return blockColorizeDefault.value;
  return blockColorizeOverrides.value[noteId] ?? blockColorizeDefault.value;
}

/** Flip the effective state for a note. Writes/clears the override so it falls
 *  back to the global default when the new value matches it (keeps the map
 *  small). A null noteId flips the global default instead. */
export function toggleBlockColorize(
  noteId: string | null | undefined
): void {
  if (!noteId) {
    setBlockColorizeDefault(!blockColorizeDefault.value);
    return;
  }
  const next = !effectiveBlockColorize(noteId);
  const overrides = { ...blockColorizeOverrides.value };
  if (next === blockColorizeDefault.value) {
    delete overrides[noteId];
  } else {
    overrides[noteId] = next;
  }
  blockColorizeOverrides.value = overrides;
  writeOverrides(OVERRIDES_KEY, overrides);
}

/** Set the global default. Prunes overrides that now match the new default. */
export function setBlockColorizeDefault(value: boolean): void {
  blockColorizeDefault.value = value;
  writeBool(DEFAULT_KEY, value);
  const overrides = { ...blockColorizeOverrides.value };
  let changed = false;
  for (const id of Object.keys(overrides)) {
    if (overrides[id] === value) {
      delete overrides[id];
      changed = true;
    }
  }
  if (changed) {
    blockColorizeOverrides.value = overrides;
    writeOverrides(OVERRIDES_KEY, overrides);
  }
}

// Cross-window live sync: the Settings window is a separate renderer process;
// when it writes these keys the `storage` event fires here, so we refresh the
// refs and the open editors re-apply via the bridge's reactive watch. (The
// storage event does NOT fire in the window that performed the write, so the
// local refs above are already correct there.)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === DEFAULT_KEY) {
      blockColorizeDefault.value = e.newValue === "true";
    } else if (e.key === OVERRIDES_KEY) {
      blockColorizeOverrides.value = readOverrides(OVERRIDES_KEY);
    }
  });
}