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
import { getCurrentContext } from "@/platform/bootstrap";
import {
  LOCAL_CONTEXT,
  readWindowContext,
  readCurrentContext
} from "@/platform/account-context";
import {
  readCtxStringWithLegacy,
  writeCtxString,
  migrateLegacyToCtx,
  matchCtxKey
} from "@/platform/per-context-prefs";

/** localStorage BASE key for the global default. The per-account value lives
 *  at `notesnook.blockColorize.<ctx>`; the legacy un-suffixed key is the
 *  pre-per-account value (read with fallback, migrated on first contact). */
const DEFAULT_KEY = "notesnook.blockColorize";
/** localStorage BASE key for the per-note override map. Per-account because note
 *  ids are DB-scoped (a given note id only exists under one account). */
const OVERRIDES_KEY = "notesnook.blockColorizeOverrides";
const DEFAULT_VALUE = false;

/** Resolve the context for the import-time ref init — `bootstrap()` may not
 *  have run yet, so prefer the window `?ctx=` pin + the shared "last used"
 *  pointer (localStorage only) over the in-process default. */
function initialCtx(): string {
  return readWindowContext() ?? readCurrentContext() ?? LOCAL_CONTEXT;
}

function readBool(base: string, ctx: string, def: boolean): boolean {
  const { value } = readCtxStringWithLegacy(base, ctx);
  if (value === "true") return true;
  if (value === "false") return false;
  return def;
}

function writeBool(base: string, ctx: string, value: boolean): void {
  try {
    writeCtxString(base, ctx, value ? "true" : "false");
  } catch (e) {
    logger.error("[block-colorize] write default failed:", e);
  }
}

function readOverrides(base: string, ctx: string): Record<string, boolean> {
  const { value: raw } = readCtxStringWithLegacy(base, ctx);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
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

function writeOverrides(base: string, ctx: string, value: Record<string, boolean>): void {
  try {
    writeCtxString(base, ctx, JSON.stringify(value));
  } catch (e) {
    logger.error("[block-colorize] write overrides failed:", e);
  }
}

/** Global default (false = colorize off by default) for the current account. */
export const blockColorizeDefault = ref<boolean>(readBool(DEFAULT_KEY, initialCtx(), DEFAULT_VALUE));

/** Per-note overrides: `noteId → enabled`. Absent = fall back to default. */
export const blockColorizeOverrides = ref<Record<string, boolean>>(
  readOverrides(OVERRIDES_KEY, initialCtx())
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
  writeOverrides(OVERRIDES_KEY, getCurrentContext(), overrides);
}

/** Set the global default. Prunes overrides that now match the new default. */
export function setBlockColorizeDefault(value: boolean): void {
  const ctx = getCurrentContext();
  blockColorizeDefault.value = value;
  writeBool(DEFAULT_KEY, ctx, value);
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
    writeOverrides(OVERRIDES_KEY, ctx, overrides);
  }
}

/** Re-read the per-account default + overrides for `ctx` (with lazy legacy
 *  migration) into the module refs. Call after a context switch (Settings
 *  `switchContext`, main window `contextChangeSignal` watch) so open editors
 *  re-apply the newly-active account's colorize state. */
export function reloadBlockColorize(ctx: string = getCurrentContext()): void {
  migrateLegacyToCtx(DEFAULT_KEY, ctx);
  migrateLegacyToCtx(OVERRIDES_KEY, ctx);
  blockColorizeDefault.value = readBool(DEFAULT_KEY, ctx, DEFAULT_VALUE);
  blockColorizeOverrides.value = readOverrides(OVERRIDES_KEY, ctx);
}

// Cross-window live sync: the Settings window is a separate renderer process;
// when it writes these keys the `storage` event fires here, so we refresh the
// refs and the open editors re-apply via the bridge's reactive watch. The
// event is ctx-gated — an account-A write must not flip account-B's window —
// and a legacy un-suffixed write (ctx null) is applied to the current context
// as a transitional safety net. (The storage event does NOT fire in the window
// that performed the write, so the local refs above are already correct there.)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    const match = matchCtxKey(e.key ?? "", [DEFAULT_KEY, OVERRIDES_KEY]);
    if (!match) return;
    const ctx = match.ctx;
    if (ctx !== null && ctx !== getCurrentContext()) return;
    if (match.base === DEFAULT_KEY) {
      blockColorizeDefault.value = e.newValue === "true";
    } else if (match.base === OVERRIDES_KEY) {
      blockColorizeOverrides.value = readOverrides(OVERRIDES_KEY, getCurrentContext());
    }
  });
}