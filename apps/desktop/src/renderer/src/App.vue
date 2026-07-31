<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useColorsStore } from "@/stores/colors";
import { useAuthStore } from "@/stores/auth";
import { useStatusStore } from "@/stores/status";
import { useSyncStore } from "@/stores/sync";
import { usePublishStore } from "@/stores/publish";
import { useVaultStore } from "@/stores/vault";
import { useBackupsStore } from "@/stores/backup";
import { useSpellCheckerStore } from "@/stores/spell-checker";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useShellStore } from "@/stores/shell";
import { useSettingsStore, THEME_MODE_KEY, TRANSPARENCY_ENABLED_KEY, THEME_DARK_KEY, THEME_LIGHT_KEY } from "@/stores/settings";
import { useConfigStore } from "@/stores/config";
import { useUpstreamNotifierStore } from "@/stores/upstream-notifier";
import { useUpdaterStore } from "@/stores/updater";
import { useAutoBackupStore } from "@/stores/auto-backup";
import { useShortcutsStore } from "@/stores/shortcuts";
import { useRemindersStore } from "@/stores/reminders";
import { useToolbarStore } from "@/stores/toolbar";
import { useNotebookIconsStore } from "@/stores/notebook-icons";
import { useTemplateNotebooksStore } from "@/stores/template-notebooks";
import { useTemplatesStore } from "@/stores/templates";
import { useMonographsStore } from "@/stores/monographs";
import { bootstrap, getCurrentContext } from "@/platform/bootstrap";
import { desktop } from "@/platform/desktop-bridge";
import { restoreSession } from "@/platform/session-restore";
import { readWindowContext, dbFileName } from "@/platform/account-context";
import { useDialogStore } from "@/stores/dialog";
import { syncLocale, reloadLocale, LOCALE_STORAGE_KEY } from "@/i18n";
import {
  useSessionPersistence,
  flushNow,
  setPersistenceSuppressed
} from "@/composables/use-session-persistence";
import { dropZoneFromPoint } from "@/utils/tab-dnd";
import { reloadBlockColorize } from "@/stores/block-colorize";
import { matchCtxKey } from "@/platform/per-context-prefs";
import type { LayoutSnapshot } from "@contracts/session-state";
import { filterLayoutSnapshot } from "@contracts/session-state";
import { autoUpdateInstalledThemes } from "@/composables/use-themes-catalog";
import { isDatabaseLockedMessage } from "@contracts/db-locked";
import { setTheme, ThemeDark, ThemeLight, type VueTheme } from "@notesnook-vue/theme-vue";
import { useReminderNotifications } from "@/composables/use-reminder-notifications";
import { useTabShortcuts } from "@/composables/use-tab-shortcuts";
import { useNavHistoryCapture } from "@/composables/use-nav-history";
import ContextMenu from "@/components/ContextMenu.vue";
import DatePickerPopup from "@/components/DatePickerPopup.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import NotebookPickerDialog from "@/components/NotebookPickerDialog.vue";
import ColorEditorDialog from "@/components/ColorEditorDialog.vue";
import LinkDialog from "@/components/LinkDialog.vue";
import IconEditorDialog from "@/components/IconEditorDialog.vue";
import ReminderEditorDialog from "@/components/ReminderEditorDialog.vue";
import PublishDialog from "@/components/PublishDialog.vue";
import SemanticSearchPromptDialog from "@/components/SemanticSearchPromptDialog.vue";


const router = useRouter();

const bootState = ref<"loading" | "ready" | "error">("loading");
const bootError = ref<string>("");
// True when the boot failure was a "database locked by another instance"
// (surfaced from main as a marked message — see contracts/db-locked.ts). Drives
// the friendlier overlay copy + Retry affordance vs the generic Startup-failed
// card.
const dbLocked = computed(
  () => bootState.value === "error" && isDatabaseLockedMessage(bootError.value)
);

const dialog = useDialogStore();
const { t } = useI18n();
const forceUnlocking = ref(false);

/** Retry the boot from the error overlay. A full reload re-runs the whole boot
 *  cleanly (stores re-init from scratch — no partial-state hazard). For the
 *  locked-by-another-instance case it re-fails until the other instance
 *  releases the lock, which is the expected loop the overlay copy describes. */
function retryBoot(): void {
  location.reload();
}

/**
 * Force-unlock the current context's database: asks main to release our
 * connection + delete the `-wal`/`-shm` journal sidecars, then reloads so the
 * boot re-opens the DB from a clean journal. Recovery path for a DB stuck
 * locked by a crash/bug (a torn WAL that blocks re-open). The main `.sql` file
 * is kept; the trade-off is that any committed-but-not-yet-checkpointed writes
 * still in the WAL are lost — confirmed via the dialog, which also warns the
 * user to close other Notesnook windows first (deleting a LIVE instance's WAL
 * would corrupt it). No-ops if the boot error isn't a held-lock failure. Never
 * leaves the user worse off: on any error it logs and still reloads.
 */
async function forceUnlock(): Promise<void> {
  if (!dbLocked.value || forceUnlocking.value) return;
  const ok = await dialog.confirm({
    title: t("boot.forceUnlockConfirmTitle"),
    message: t("boot.forceUnlockConfirmMsg"),
    confirmLabel: t("boot.forceUnlock"),
    cancelLabel: t("common.cancel"),
    danger: true
  });
  if (!ok) return;
  forceUnlocking.value = true;
  try {
    await desktop.sqlite.forceUnlock.mutate({
      filePath: dbFileName(getCurrentContext())
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[boot] forceUnlock failed:", e);
  } finally {
    location.reload();
  }
}

// The separate Settings window loads the renderer with `?window=settings`.
// It runs a *minimal* boot (DB + settings + spell-check + i18n only) and
// routes to the top-level `/settings` — no auth/sync/vault/notes, and none of
// the shell-only watches below (those would redirect to /login since auth is
// never initialised in this window).
const windowType =
  typeof URLSearchParams !== "undefined" ? new URLSearchParams(location.search).get("window") : null;
const isSettingsWindow = windowType === "settings";
const isChangelogWindow = windowType === "changelog";
const isNoteWindow = windowType === "note";
const noteWindowNoteId = isNoteWindow
  ? new URLSearchParams(location.search).get("noteId")
  : null;
// A detached *pane* window (Phase 4.6): a whole editor pane (a group leaf +
// all its tabs) torn off into its own window. Boots the full shell like the
// main window but hydrates its own `LayoutSnapshot` (fetched from main via the
// `paneId` it was opened with) instead of `mainWindowOpenTabs`. Owns its layout
// (saves to its own session slot) but defers sync / upstream / reminder
// scheduling / session restore to the main window, like a note window.
const isPaneWindow = windowType === "pane";
const paneWindowId = isPaneWindow ? new URLSearchParams(location.search).get("paneId") : null;
// Per-window account context: main stamps `?ctx=<id>` on note/pane/account
// windows so each opens its own account's encrypted SQLite context. The
// default first/main window (and Settings/Changelog) carry no `ctx` →
// `bootstrap()` falls back to the shared `localStorage` `currentContext` pointer.
const ctxParam = readWindowContext();
// A dedicated sign-in window (the switcher's "Add account" action) boots with
// `?signin=1` so it shows the login screen even when a cached account token or
// the local-mode `skippedLogin` flag would otherwise show the shell. It boots
// the local context (no cached account) so it starts logged-out; once the user
// signs in, `auth.login` switches this window to the new account's context and
// `isLoggedIn` flips the effective shell on → the account's notes show.
const isSignInWindow = new URLSearchParams(location.search).get("signin") === "1";
/** Any torn-off editor window (note or pane) — these defer main-window-only
 *  boot steps (sync, upstream notifier, reminder scheduling, session restore). */
const isTornOffWindow = isNoteWindow || isPaneWindow;


const auth = useAuthStore();
const status = useStatusStore();
const sync = useSyncStore();
const vault = useVaultStore();
const backups = useBackupsStore();
const spellChecker = useSpellCheckerStore();
const editorLayout = useEditorLayoutStore();
const publish = usePublishStore();
const settings = useSettingsStore();
const upstreamNotifier = useUpstreamNotifierStore();
const config = useConfigStore();
const notes = useNotesStore();

// Tell the auth store whether this is a dedicated sign-in window so its
// `effectiveShowShell` getter + the router guard keep it on the login screen
// until the user signs in (see `stores/auth.ts`).
auth.forceSignIn = isSignInWindow;

/**
 * Whether THIS window should show the shell (vs the login screen). Delegates to
 * the store's `effectiveShowShell` (which accounts for `forceSignIn`) so the
 * route settling + watches here stay in sync with the router guard.
 */
const effectiveShowShell = computed(() => auth.effectiveShowShell);

// --- Theme application (Phase 7.0 on-site) ---------------------------------
// `bootstrap()` injects `ThemeDark` as the pre-mount default (no flash); here
// we apply the user's stored `themeMode` (light/dark/system) and keep it in
// sync. `setTheme` rewrites the runtime CSS vars; `desktop.window.setNativeTheme`
// mirrors the choice to the OS-native material (macOS vibrancy / Windows
// acrylic) so the window chrome matches. "system" follows the OS preference;
// we also listen to `prefers-color-scheme` so the renderer theme re-applies
// when the OS flips while in system mode (the native side tracks automatically).
function resolveSystemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : true;
}

function applyTheme(mode: "light" | "dark" | "system"): void {
  const effective = mode === "system" ? (resolveSystemDark() ? "dark" : "light") : mode;
  // Resolve the active theme from the two slots (dark/light) rather than the
  // hardcoded ThemeDark/ThemeLight — a theme installed from the catalog or
  // imported from a file lives in the slot and is applied here.
  setTheme(effective === "dark" ? settings.darkTheme : settings.lightTheme);
  // nativeTheme.themeSource accepts "system" natively (tracks OS); for
  // light/dark it pins the material. Best-effort — never throws.
  void desktop.window.setNativeTheme.mutate(mode).catch(() => {
    /* main unreachable (e.g. tests) — renderer theme still applies */
  });
}

/**
 * Apply only the renderer CSS theme (no `setNativeTheme`). Used by the
 * cross-window `storage` listener: when the Settings window changes
 * `themeMode`, `nativeTheme` (process-global) already flips the acrylic for
 * every window, but each window's renderer CSS vars are independent — so the
 * other window re-applies `setTheme` here. Deliberately does NOT call
 * `setNativeTheme` (that would re-broadcast and the initiator already did it).
 */
function applyThemeCss(mode: "light" | "dark" | "system"): void {
  const effective = mode === "system" ? (resolveSystemDark() ? "dark" : "light") : mode;
  setTheme(effective === "dark" ? settings.darkTheme : settings.lightTheme);
}

/**
 * Apply the transparency preference to <html> as `data-transparency`
 * (`on`/`off`). The opaque-root CSS in style.css opts out of the acrylic/glass
 * look when this is `off` (and unconditionally on Linux via `data-platform`).
 * DOM-free store keeps the value; this is the on-site application, mirroring
 * `applyTheme`/`applyThemeCss`. Idempotent and safe in a non-DOM (test) env.
 */
function applyTransparency(enabled: boolean): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.transparency = enabled ? "on" : "off";
  }
}

let mediaCleanup: (() => void) | undefined;
let storageCleanup: (() => void) | undefined;
function bindSystemThemeListener(): void {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (settings.themeMode === "system") applyTheme("system");
  };
  mq.addEventListener("change", onChange);
  mediaCleanup = () => mq.removeEventListener("change", onChange);
}

/**
 * Cross-window theme sync. `themeMode` is persisted to `localStorage` by the
 * settings store; localStorage is shared across same-origin Electron windows,
 * and a `storage` event fires in the *other* window when one writes. So when
 * the Settings window changes the theme, the main window re-applies the
 * renderer CSS theme here. (`nativeTheme` is process-global, so the acrylic
 * already flipped — this only fixes the renderer CSS vars.) The event does
 * NOT fire in the originating window, so there's no double-apply there.
 */
function bindCrossWindowThemeListener(): void {
  if (typeof window === "undefined") return;
  // Per-account client prefs are keyed `notesnook.<base>.<ctx>`; a `storage`
  // event fires in the *other* same-origin windows when one writes. Match the
  // event key against the known bases + ctx suffix, and only apply when the
  // write is for THIS window's context (an account-A theme/locale change must
  // not flip account-B's window). A legacy un-suffixed key (ctx null) is
  // applied to the current context as a transitional safety net. The event
  // does NOT fire in the originating window, so its local refs are already
  // correct — this only updates *other* windows.
  const bases = [
    THEME_MODE_KEY,
    TRANSPARENCY_ENABLED_KEY,
    THEME_DARK_KEY,
    THEME_LIGHT_KEY,
    LOCALE_STORAGE_KEY
  ];
  const onStorage = (e: StorageEvent) => {
    const match = matchCtxKey(e.key ?? "", bases);
    if (!match) return;
    if (match.ctx !== null && match.ctx !== getCurrentContext()) return;
    if (
      match.base === THEME_MODE_KEY &&
      (e.newValue === "light" || e.newValue === "dark" || e.newValue === "system")
    ) {
      // Mirror the new mode into this window's store (no signal bump — see
      // `syncThemeMode`) so the system-mode OS-preference listener etc. see
      // the right value, then re-apply the renderer CSS.
      settings.syncThemeMode(e.newValue, match.ctx);
      applyThemeCss(e.newValue);
    } else if (
      match.base === TRANSPARENCY_ENABLED_KEY &&
      (e.newValue === "true" || e.newValue === "false")
    ) {
      // Mirror + re-apply the transparency attr (no signal bump — see
      // `syncTransparencyEnabled`; the originating window already applied it).
      const enabled = e.newValue === "true";
      settings.syncTransparencyEnabled(enabled, match.ctx);
      applyTransparency(enabled);
    } else if (match.base === THEME_DARK_KEY || match.base === THEME_LIGHT_KEY) {
      // A theme slot changed in another window (catalog install / file import / restore stock).
      // Mirror the parsed theme into this window's slot and re-apply the active
      // theme in case the changed slot is the active one. Malformed JSON is
      // ignored (the originating window validated before writing).
      try {
        const fallback = match.base === THEME_DARK_KEY ? ThemeDark : ThemeLight;
        const theme = e.newValue != null ? (JSON.parse(e.newValue) as VueTheme) : fallback;
        settings.syncStoredTheme(
          match.base === THEME_DARK_KEY ? "dark" : "light",
          theme,
          match.ctx
        );
        applyThemeCss(settings.themeMode);
      } catch {
        /* ignore malformed slot value */
      }
    } else if (match.base === LOCALE_STORAGE_KEY) {
      // A locale change originated in another window (typically the Settings
      // window's language picker). Mirror it into THIS window's vue-i18n ref so
      // every `t()` re-renders live — no persist/IPC, since the originator
      // already did both (and the `storage` event doesn't fire in the
      // originator, so no double-apply there). Before this, other open windows
      // only picked up a locale change after a reload.
      syncLocale(e.newValue, match.ctx);
    }
  };
  window.addEventListener("storage", onStorage);
  storageCleanup = () => window.removeEventListener("storage", onStorage);
}

// Reminder OS-notification scheduling (main window only — settings / note /
// pane windows don't own reminders, and only one window should push the schedule
// to main to avoid double-scheduling across windows). Wires the reminders
// store's `items` to `desktop.reminders.schedule` + listens for
// `app:reminder-fired` to reschedule. Called synchronously at setup so its
// `onUnmounted` cleanup registers against this component instance.
if (!isSettingsWindow && !isChangelogWindow && !isTornOffWindow) {
  useReminderNotifications();
}
// Tab keyboard shortcuts (Cmd/Ctrl+W, Cmd/Ctrl+1-9, …) — mounted in every
// editor-bearing window (main + pane; a pane window has its own tab strip).
// Skipped in the minimal-boot settings / changelog windows and in single-tab
// note windows (focus mode). Called synchronously at setup so its
// `onUnmounted` cleanup registers against this component instance.
if (!isSettingsWindow && !isChangelogWindow && !isNoteWindow) {
  useTabShortcuts();
  // Navigation-history capture watcher (global back/forward). Same window
  // scope as tab shortcuts — every editor-bearing window keeps its own
  // per-window nav history; settings/changelog/note windows don't need it.
  useNavHistoryCapture();
}


// Deep-link (Phase 6.5): the main process forwards `nn://note/<id>` URLs as
// `app:open-note` events. Open the note in the editor when the shell is
// visible; otherwise queue until login/local-only shows the shell.
const pendingDeepLinkNote = ref<string | null>(null);

function openNoteFromDeepLink(noteId: string): void {
  if (auth.showShell) {
    // Ensure the editor-bearing route is active (the editor only renders on
    // /all), then open the note as a tab.
    void router.push("/all").then(() => useNotesStore().selectNote(noteId));
  } else {
    pendingDeepLinkNote.value = noteId;
  }
}

/**
 * Open a note dragged from ANOTHER window onto this window. HTML5
 * `dataTransfer` doesn't cross Electron windows, so this window's drop handlers
 * never fired — main forwards the release point as client coords (cursor − this
 * window's origin) so we can run the SAME split-vs-move zone logic our in-window
 * `EditorPane` uses, against the editor body under the cursor:
 *  - edge → split that pane in the zone direction + open the note in the new
 *    sibling (`openNoteSplit`);
 *  - centre of the body → open the note as a tab in THAT pane (`openTab`), so a
 *    drop on a non-focused pane lands there (not in the active group);
 *  - not over an editor body (tab strip / sidebar / list) → open as a tab in
 *    the active group (no pane to target).
 */
function openNoteAt(payload: { noteId: string; x: number; y: number }): void {
  if (!auth.showShell) {
    openNoteFromDeepLink(payload.noteId);
    return;
  }
  void router.push("/all").then(() => {
    const layout = editorLayout;
    const el = document.elementFromPoint(payload.x, payload.y) as HTMLElement | null;
    const body = el?.closest?.("[data-editor-body]") as HTMLElement | null;
    if (body) {
      const pane = body.closest("[data-pane-group]") as HTMLElement | null;
      const groupId = pane?.dataset.paneGroup ?? layout.activeGroupId;
      const zone = dropZoneFromPoint(payload.x, payload.y, body.getBoundingClientRect());
      if (zone === "left" || zone === "right" || zone === "top" || zone === "bottom") {
        layout.openNoteSplit(groupId, payload.noteId, zone);
        return;
      }
      // centre of THIS pane → open as a tab in the pane the cursor is over (NOT
      // the active group — the user may have dropped onto a non-focused pane).
      layout.openTab(groupId, payload.noteId);
      return;
    }
    // not over an editor body (tab strip / sidebar / list) → open as a tab in
    // the active group (no pane to target).
    useNotesStore().selectNote(payload.noteId);
  });
}

/**
 * Open a *pane* (a group leaf + all its tabs) dragged from ANOTHER window onto
 * this window — the cross-window inbound counterpart to the pane-grip tear-off
 * (Phase 4.6). HTML5 `dataTransfer` doesn't cross Electron windows, so this
 * window's drop handlers never fired; main forwards the pane's
 * {@link LayoutSnapshot} + the release point as client coords (cursor − this
 * window's origin) so we can run the SAME edge-zone split logic our in-window
 * `EditorPane` uses, against the editor body under the cursor:
 *  - edge → split that pane in the zone direction + import the pane's tabs into
 *    the new sibling (`importPaneSnapshot`);
 *  - centre of the body → import the tabs into THAT pane (no split);
 *  - not over an editor body → import into the active group (no pane to target).
 * The source window closes its pane after the move (its `dragend` calls
 * `closeGroup` on a `"moved"` result); this window just creates new tabs for the
 * notes/attachments (one tab per note is preserved by `openTab`'s reuse).
 */
function openPaneAt(payload: { snapshot: LayoutSnapshot; x: number; y: number }): void {
  if (!auth.showShell) return;
  void router.push("/all").then(() => {
    const layout = editorLayout;
    const el = document.elementFromPoint(payload.x, payload.y) as HTMLElement | null;
    const body = el?.closest?.("[data-editor-body]") as HTMLElement | null;
    if (body) {
      const pane = body.closest("[data-pane-group]") as HTMLElement | null;
      const groupId = pane?.dataset.paneGroup ?? layout.activeGroupId;
      const zone = dropZoneFromPoint(payload.x, payload.y, body.getBoundingClientRect());
      layout.importPaneSnapshot(payload.snapshot, groupId, zone);
      return;
    }
    // not over an editor body → import into the active group (centre semantics).
    layout.importPaneSnapshot(payload.snapshot, layout.activeGroupId, "center");
  });
}

/**
 * Bind this window's webContents to the current account context on the main
 * side (`desktop.session.bindContext`) so main-side window-geometry writes land
 * under the right account. Best-effort — silently no-ops when main is
 * unreachable (e.g. contract tests). Call once on boot and again after a
 * context switch.
 */
function bindContextToSession(): void {
  void desktop.session.bindContext
    .mutate({ contextId: getCurrentContext() })
    .catch(() => {
      /* main unreachable — no-op */
    });
}

onMounted(async () => {
  // --- Settings window: minimal boot -------------------------------------
  // No deep-link/tray/close-tab subscriptions (those are main-window only),
  // no auth.init (auth.status stays "unknown" → the guard allows /settings),
  // no sync/vault/editor-layout/notes/collections. Just the DB (for
  // db.settings), the settings store, the spell-checker snapshot, i18n, and
  // the theme. Then route to /settings and surface the UI.
  if (isSettingsWindow) {
    applyTheme(settings.themeMode);
    applyTransparency(settings.transparencyEnabled);
    bindSystemThemeListener();
    bindCrossWindowThemeListener();
    try {
      await bootstrap();
      // `bootstrap()` injects `ThemeDark` as its no-flash default, overwriting
      // the pre-bootstrap `applyTheme` above — re-apply the user's persisted
      // choice so the settings window matches the app theme (not stuck dark).
      applyTheme(settings.themeMode);
      await settings.load();
      // Re-read the per-account client-only prefs for the NOW-current context.
      // The settings/config store refs were populated at construction (during
      // `<script setup>`, before `bootstrap`), when `getCurrentContext()` was
      // still `LOCAL_CONTEXT`. `bootstrap` switched it to the account ctx (from
      // `?ctx=`), so without this reload the refs hold LOCAL's values for the
      // whole settings-window session — the semantic-search toggle displayed
      // LOCAL's value while writing to the account ctx, so a disable appeared
      // not to persist (it showed ON again on reopen). Mirrors the main-window
      // boot's `loadClientPrefs()` call.
      settings.loadClientPrefs();
      config.loadClientPrefs();
      applyTheme(settings.themeMode);
      applyTransparency(settings.transparencyEnabled);
      void spellChecker.refresh();
      bootState.value = "ready";
      void router.replace("/settings");
      // eslint-disable-next-line no-console
      console.info("[boot] settings window ready");
    } catch (e) {
      bootState.value = "error";
      bootError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[boot:settings]", e);
    }
    return;
  }

  if (isChangelogWindow) {
    applyTheme(settings.themeMode);
    applyTransparency(settings.transparencyEnabled);
    bindSystemThemeListener();
    bindCrossWindowThemeListener();
    try {
      await bootstrap();
      applyTheme(settings.themeMode);
      await settings.load();
      void spellChecker.refresh();
      bootState.value = "ready";
      void router.replace("/changelog");
      // eslint-disable-next-line no-console
      console.info("[boot] changelog window ready");
    } catch (e) {
      bootState.value = "error";
      bootError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[boot:changelog]", e);
    }
    return;
  }


  // Subscribe to deep-link note events as early as possible so a cold-start
  // `nn://note/<id>` (queued in main until the page loads) is not missed.
  window.appEvents?.onOpenNote((noteId) => openNoteFromDeepLink(noteId));
  // Cross-window tab drop: main forwards the release point (client coords) when
  // a tab dragged from another window lands on this window. Decides split-vs-
  // move from the cursor position over our editor body (HTML5 `dataTransfer`
  // doesn't cross windows, so our drop handlers never fired).
  window.appEvents?.onOpenNoteAt((payload) => openNoteAt(payload));
  // Cross-window pane drop (Phase 4.6): main forwards a dragged pane's
  // snapshot + release point (client coords) when a pane grip drag from
  // another window lands on this window. Imports the pane's tabs as a new
  // split sibling (edge) or into the targeted pane (centre), mirroring
  // `openNoteAt`'s zone logic.
  window.appEvents?.onOpenPaneAt((payload) => openPaneAt(payload));

  // System-tray actions (Phase 6.4): the tray forwards new-note/new-notebook
  // here. Only act once the shell is visible (creating notes/notebooks pre-login
  // would open them invisibly); the tray's "Show" item already surfaces the
  // window for a logged-out user.
  window.appEvents?.onTrayAction((actionId) => {
    if (!auth.showShell) return;
    if (actionId === "new-note") {
      void router.push("/all").then(() => useNotesStore().create());
    } else if (actionId === "new-notebook") {
      void useCollectionsStore().createNotebook();
    }
  });

  const notes = useNotesStore();
  const collections = useCollectionsStore();
  const colors = useColorsStore();

  // App-menu "Close Tab" (Cmd/Ctrl+W, sent from main's ApplicationMenu) closes
  // the active editor tab. The renderer is the source of truth for the active
  // tab id; main only signals the intent (payload ignored).
  window.appEvents?.onCloseTab(() => {
    const id = notes.activeTabId;
    if (id) notes.closeTab(id);
  });

  // Cross-window DB-mutation signal: the Settings window imported a backup
  // (or created/deleted a vault) in its own renderer, mutating the shared DB.
  // Core events are per-process, so this window's stores won't see the change
  // — reload notes/collections + re-seed vault/backup/sync status here. Only
  // act once the shell is visible (pre-login there's nothing to reload).
  window.appEvents?.onDataChanged(() => {
    if (!auth.showShell) return;
    void useNotesStore().load();
    void useCollectionsStore().load();
    void useColorsStore().refresh();
    void useRemindersStore().refresh();
    void vault.refresh();
    void backups.refresh();
    void status.refreshSync();
  });

  // Cross-window note sync: another window saved a note. Refresh our view of
  // it (list item meta + preview) and, if it's the active note, bump the
  // editor's reload signal — see `Editor.vue` (skip-if-dirty: a receiver
  // mid-edit is never clobbered). Core events are per-process, so without this
  // relay a save in one window is invisible to the others. Settings window
  // doesn't reach this code path (minimal boot).
  window.appEvents?.onNoteChanged((noteId: string) => {
    if (!auth.showShell) return;
    void useNotesStore().handleRemoteNoteChanged(noteId);
  });

  // Auto-updater: subscribe to the live `updater:status` IPC push (download
  // progress + "ready to install") and kick the periodic update check so a
  // published update surfaces as a title-bar badge without user action.
  // Idempotent; runs in both the main + settings windows (the Updates section
  // lives in the settings window and needs the IPC push). Dev is a no-op.
  useUpdaterStore().init();

  // Apply the stored theme on boot (corrects bootstrap's dark default to the
  // user's choice) + listen for OS preference changes while in system mode.
  // Also bind the cross-window theme listener so a theme change made in the
  // Settings window re-applies here (the main window).
  applyTheme(settings.themeMode);
  applyTransparency(settings.transparencyEnabled);
  bindSystemThemeListener();
  bindCrossWindowThemeListener();

  try {
    await bootstrap(ctxParam);
    // `bootstrap()` injects `ThemeDark` as its no-flash default, overwriting
    // the pre-bootstrap `applyTheme` above — re-apply the user's persisted
    // choice so a fresh boot matches the saved theme (not stuck dark).
    applyTheme(settings.themeMode);
    await auth.init();
    // Re-read the per-account client-only prefs for the NOW-current context.
    // The settings/config store refs were populated at construction (during
    // `<script setup>`, before `bootstrap`/`auth.init`), when
    // `getCurrentContext()` was still `LOCAL_CONTEXT`. `bootstrap` has since
    // switched it to the restored account's context id, so without this reload
    // the refs hold the LOCAL values for the whole session. That re-showed the
    // semantic-search onboarding dialog on every restart into a logged-in
    // account: the dialog gates on `!settings.semanticSearchPrompted`, the
    // dialog handlers persist `prompted` to the ACCOUNT ctx, but the ref read
    // the LOCAL ctx — which was never written — so it stayed `false` forever.
    // `auth.init` (unlike `completeLogin`/`switchToAccount`) does NOT bump
    // `contextChangeSignal`, so the watch below that does this reload for
    // mid-session switches never fires on boot. Mirror that watch exactly:
    // `loadClientPrefs` bumps `themeChangeSignal`/`transparencyChangeSignal`
    // only when the values actually change, so the watches above re-apply the
    // account's theme/transparency; `reloadBlockColorize`/`reloadLocale` do the
    // same for their per-account prefs. For local mode (ctx unchanged) the
    // values are identical → no signal bumps → no-op.
    settings.loadClientPrefs();
    config.loadClientPrefs();
    reloadBlockColorize();
    reloadLocale();
    // Initialise the editor-layout store (root group) so the single-pane
    // editor has a group to open tabs in. Idempotent. Multi-pane splits are
    // Phase 4.2/4.3 (on-site).
    editorLayout.init();
    // Session persistence (main + pane windows — both own a layout): bind the
    // MAIN window to its account context so main-side geometry writes land under
    // the right account, mount the debounced layout-snapshot watcher, and flush
    // on quit. A PANE window owns its own layout too but saves to its own
    // session slot (keyed by paneId) and main tracks its geometry itself, so it
    // skips `bindContextToSession`. Settings / note windows don't own a layout
    // (note windows are single-tab focus mode).
    if (!isSettingsWindow && !isTornOffWindow) {
      bindContextToSession();
      useSessionPersistence();
      window.appEvents?.onBeforeQuit(() => {
        void flushNow();
      });
      // macOS lets the user close the main window without quitting (the app
      // stays alive). Flush the layout there too so the last edits land on disk
      // before the window's renderer unloads. Best-effort (async IPC).
      window.addEventListener("beforeunload", () => {
        void flushNow();
      });
    } else if (isPaneWindow) {
      useSessionPersistence({ paneId: paneWindowId ?? undefined });
      window.appEvents?.onBeforeQuit(() => {
        void flushNow();
      });
      window.addEventListener("beforeunload", () => {
        void flushNow();
      });
    }
    // Bind sync events once (idempotent) and seed the status bar's sync
    // state from `db.lastSynced()`; safe even when not logged in — the view
    // renders "Local only" until login, and `refreshSync` only queries the
    // local lastSynced timestamp. Start the wall-clock so relative sync
    // times stay accurate.
    status.bindSyncEvents();
    status.startClock();
    void status.refreshSync();
    // Best-effort: silently upgrade any catalog-installed themes to their
    // newest server version (main window only; never throws on boot).
    if (!isSettingsWindow && !isTornOffWindow) void autoUpdateInstalledThemes();
    // Bind the SSE-driven auto-pull once (idempotent): when the server pushes
    // `triggerSync` (another device synced), core publishes
    // `databaseSyncRequested` and this triggers a `db.sync()` so the change
    // appears here without a manual refresh. The handler self-gates (logged-in
    // + sync-enabled + main window; note/settings windows defer). Safe
    // pre-login — the handler is a no-op until logged in.
    sync.bindAutoSyncEvents();
    // Bind the monographs-updated event once (idempotent): when the server
    // pushes monograph changes from another device, core emits
    // `monographsUpdated` (bridged in `event-bridge.ts`) and this reseeds the
    // active note's publish state + reloads the notes list. Safe pre-login —
    // no-op until a note is active / the event fires.
    publish.bindMonographsEvents();
    // Bind the per-item sync-merge event once (idempotent): core emits
    // `syncItemMerged` for each note/content item it pulls + merges, and the
    // notes store accumulates the affected ids so the `syncCompletedSignal`
    // watcher below can apply *incremental* in-place list updates instead of
    // rebuilding the whole list (which flashed every row's tag chips + color
    // tint on every sync). Safe pre-login — no-op until a sync pulls notes.
    notes.bindSyncEvents();
    // If booting into an already-logged-in account (cached user — e.g. a
    // return visit, or right after login's reload), pull the account's server
    // data. A fresh login also lands here after its reload. Local mode is
    // unaffected (sync is auth-gated; without a token it surfaces as
    // `lastError` and is ignored). Skipped in a torn-off note window — the
    // main window owns sync to avoid double-sync across windows; the note
    // window still binds sync events above for status display.
    if (auth.isLoggedIn && config.syncEnabled && !isTornOffWindow) void sync.startSync();
    // Bind vault lock/unlock events once (idempotent) + seed vault existence
    // / lock state from `db.vault`. Safe pre-login — `exists()` is local.
    vault.bindVaultEvents();
    void vault.refresh();
    // Seed the last-backup timestamp for the Backup/Restore UI (on-site).
    void backups.refresh();
    // Seed the spell-checker snapshot (enabled flag + available/enabled
    // languages + custom dictionary) for the on-site settings UI. Safe
    // pre-login — the bridge is main-process, not auth-gated.
    void spellChecker.refresh();
    // In-app upstream-release notifier (main window only — the title-bar
    // indicator lives here, and the shared localStorage throttle prevents a
    // note window from re-checking). Fire-and-forget: a GitHub outage never
    // blocks boot. Privacy-toggle-gated + once-per-24h inside the store.
    if (!isTornOffWindow) void upstreamNotifier.maybeCheck();
    // Per-account auto-backup scheduler (main window only — core `db.backup`
    // runs in the renderer, and the timers die with this window, matching the
    // updater/notifier pattern). Idempotent; no-ops until a backup directory +
    // a cadence are configured. Fire-and-forget: a backup failure never blocks
    // boot (each context is isolated inside the tick).
    if (!isTornOffWindow && !isSettingsWindow && !isChangelogWindow) {
      useAutoBackupStore().init();
    }
    if (auth.showShell) {
      // Await shortcuts BEFORE notes.load. SQLite is a single serialized mutex
      // (`sqlite-dialect.ts`) and `notes.load()` fires 3 fire-and-forget queries
      // × N notes (preview/tags/color) that saturate it. `db.shortcuts.resolved()`
      // issues its notebook/tag queries across two awaits, so if it ran after
      // notes.load its second query would queue behind the N-note fan-out and
      // stall the boot overlay. Running shortcuts first keeps both its queries
      // ahead of the fan-out; awaiting it also makes notebook/tag shortcut rows
      // present at first paint (no pop-in vs favourite-note rows, which are a
      // sync computed over notes items). See plan melodic-hopping-rainbow.
      await useShortcutsStore().refresh();
      await notes.load();
      void collections.load();
      void colors.refresh();
      // Seed the reminders list (db.reminders) so the sidebar badge + the
      // RemindersView populate on first paint. The `useReminderNotifications`
      // composable watches `items` and pushes the schedule to main on change.
      void useRemindersStore().refresh();
      // Load the persisted editor-toolbar layout (db.settings, synced per
      // account). Fire-and-forget — the toolbar renders `DEFAULT_TOOLBAR`
      // immediately and `load()` swaps to the custom layout if one is stored.
      void useToolbarStore().load();
      // Load the per-notebook icon map (db.settings, synced per account). Fire-
      // and-forget — the sidebar renders the default `book` glyph immediately
      // and `load()` swaps in custom icons if any are stored. Decorative only,
      // so safe to run alongside the list fan-out (no IPC dependency).
      void useNotebookIconsStore().load();
      // Load the per-template "notebook on creation" policy map (db.settings,
      // synced per account). Fire-and-forget — `notes.create` reads the in-memory
      // map; an empty map (no stored policies) means every template uses the
      // default (active-filter) behavior.
      void useTemplateNotebooksStore().load();
      // Load the templates list (notes tagged "template") so the command
      // palette's per-template commands + the Notes settings pickers populate.
      // Fire-and-forget like the neighboring fan-out calls.
      void useTemplatesStore().load();
      // Restore the saved editor session for this account (open tabs + split
      // layout + torn-off note + pane windows). After `notes.load()` so the
      // list is the source of valid note ids for filtering. Main window only —
      // note / pane / settings windows don't restore a multi-tab session (a
      // pane window hydrates its own snapshot below; a note window opens its
      // single note).
      if (!isSettingsWindow && !isTornOffWindow) {
        await restoreSession(getCurrentContext());
      }
    }
    bootState.value = "ready";
    // Settle the initial route now that auth is resolved. During boot the
    // guard saw `status === "unknown"` and let the redirect to `/all` through;
    // here we move to `/login` if the user is logged-out and not local-only.
    // A dedicated sign-in window (`?signin=1`) forces `/login` until sign-in.
    void router.replace(effectiveShowShell.value ? "/all" : "/login");
    // Torn-off note window: enable focus mode (hides sidebar + notes list) and
    // open the note as a tab. Only when the shell is visible — a note window
    // torn from a logged-in/local-only session always has a shell; if auth
    // somehow isn't resolved the deep-link-style flush below catches it.
    if (isNoteWindow && noteWindowNoteId && auth.showShell) {
      useShellStore().setFocusMode(true);
      void router.push("/all").then(() => useNotesStore().selectNote(noteWindowNoteId));
    }
    // Detached pane window (Phase 4.6): hydrate this window's layout from the
    // snapshot main opened it with (fetched by `paneId`), filtered to notes
    // still valid in this account's DB. The pane keeps the full shell (no focus
    // mode) so it's a fully functional editing window with its own tabs.
    if (isPaneWindow && paneWindowId && auth.showShell) {
      void router.push("/all").then(async () => {
        try {
          const snapshot = await desktop.window.getPaneSnapshot.query({ paneId: paneWindowId });
          if (!snapshot) return; // unknown id (post-restart) → empty root pane
          const validNoteIds = useNotesStore().items.map((n) => n.id);
          editorLayout.hydrate(filterLayoutSnapshot(snapshot, validNoteIds));
        } catch {
          // Main unreachable → leave the empty root pane.
        }
      });
    }
    // eslint-disable-next-line no-console
    console.info(`[boot] ready — auth:${auth.status}`);
  } catch (e) {
    bootState.value = "error";
    bootError.value = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[boot]", e);
  }
});

// Re-apply the theme when the user changes it in Settings (Phase 7.0).
watch(
  () => settings.themeChangeSignal,
  () => applyTheme(settings.themeMode)
);

// Re-apply the transparency preference when the user toggles it in Settings.
watch(
  () => settings.transparencyChangeSignal,
  () => applyTransparency(settings.transparencyEnabled)
);

// Auto-sync after a save (debounced + gated inside the sync store). Without
// this, a mid-session edit — e.g. dropping an image — saves locally (the
// attachment is stored + the note content is written) but never reaches the
// server until the next boot sync, so a just-added image doesn't appear on
// other devices until a restart. Fires on every `saveState` → "saved"
// transition; the sync store collapses a burst of saves into one sync and
// skips it when not logged in / sync disabled / in a note or settings window.
if (!isSettingsWindow) {
  watch(
    () => notes.saveState,
    (s) => {
      if (s === "saved") sync.scheduleAutoSync();
    }
  );
}

onUnmounted(() => {
  mediaCleanup?.();
  storageCleanup?.();
});

// Load notes the first time the shell becomes visible (logged in, or the user
// chose local-only via "Continue without account"). Also re-seed the sync
// status — after a login `lastSynced` may have changed. Skipped in the
// Settings window (no shell/notes there).
const notesLoaded = ref(false);
if (!isSettingsWindow) {
  watch(
    () => effectiveShowShell.value,
    async (show) => {
      if (show && !notesLoaded.value) {
        notesLoaded.value = true;
        await useNotesStore().load();
        void useCollectionsStore().load();
        void useColorsStore().refresh();
        void useShortcutsStore().refresh();
        void useRemindersStore().refresh();
        void useNotebookIconsStore().load();
        void useTemplateNotebooksStore().load();
        void status.refreshSync();
        void vault.refresh();
        void backups.refresh();
        void spellChecker.refresh();
        // Restore the saved editor session now that the shell is visible and
        // the notes list is populated (valid note ids for filtering). Main
        // window only. `restoreSession` guards against re-restoring the same
        // context, so a redundant call here (when onMounted already restored)
        // is a no-op.
        if (!isTornOffWindow) {
          await restoreSession(getCurrentContext());
        }
      }
      // Flush a deep link that arrived while the user was logged out.
      if (show && pendingDeepLinkNote.value) {
        const noteId = pendingDeepLinkNote.value;
        pendingDeepLinkNote.value = null;
        void router.push("/all").then(() => useNotesStore().selectNote(noteId));
      }
    }
  );

  // Follow auth state with the route so screen transitions are automatic:
  // login / local-only → shell, logout / re-arm sign-in → login screen. The
  // initial settle happens in `onMounted` once `auth.init()` resolves; this
  // watch handles every subsequent transition (logout, login, skip, request,
  // and the sign-in window's login→shell flip once `isLoggedIn` turns on).
  watch(
    () => effectiveShowShell.value,
    (show) => {
      void router.replace(show ? "/all" : "/login");
    }
  );

  // Apply synced data whenever a sync completes so freshly-synced server data
  // (notes pulled down after login, or later changes from other devices)
  // appears without a manual refresh. The status store bumps
  // `syncCompletedSignal` on each `syncCompleted` event.
  //
  // NOTES are applied *incrementally*: the notes store accumulated the note ids
  // core merged during the sync (`syncItemMerged`), and `applySyncedNotes`
  // patches/inserts/removes just those rows in place — no whole-list rebuild,
  // so unaffected rows keep their tag chips + color tint (no flicker). When the
  // sync pulled no notes (an upload-only save-driven auto-sync, or a tag/
  // notebook-only pull) the notes list is left untouched entirely.
  //
  // Collections/colors/etc. may still change in a note-less sync, so they're
  // refreshed on every completion — but `collections.load` diff-merges in place
  // (no sidebar tree re-render), and the rest are cheap badge/refresh calls.
  watch(
    () => status.syncCompletedSignal,
    async () => {
      if (!auth.showShell) return;
      // Live-reload open notes the sync actually changed. Capture each open
      // note's `dateEdited` BEFORE applying so only notes the sync modified
      // get their change signal bumped — bumping an unchanged open note would
      // reload it (Editor.vue skip-if-dirty) and reset the cursor even though
      // the content is identical. The skip-if-dirty guard still protects any
      // pane mid-edit; the receiver's next save wins + re-broadcasts.
      const openNoteIds = Object.values(editorLayout.tabs)
        .filter((t) => t.kind === "note" && !!t.noteId)
        .map((t) => t.noteId as string);
      const before = new Map<string, number>();
      for (const id of openNoteIds) {
        const item = notes.items.find((n) => n.id === id);
        if (item) before.set(id, item.dateEdited);
      }
      // Drain the ids core merged during this sync (empty → nothing pulled).
      const mergedIds = notes.drainSyncMergedNoteIds();
      if (mergedIds.length > 0) {
        await notes.applySyncedNotes(mergedIds);
      }
      // Sidebar + badges may change even on a note-less sync (tag/notebook-only
      // pull), so always refresh these. `collections.load` diff-merges → no
      // tree flicker.
      void useCollectionsStore().load();
      void useColorsStore().refresh();
      void useShortcutsStore().refresh();
      void useRemindersStore().refresh();
      void useNotebookIconsStore().load();
      void useTemplateNotebooksStore().load();
      // Refresh the active note's publish state (core's sync `stop()` already
      // refreshed the monographs cache) + the Monographs list so cross-device
      // publish/unpublish changes appear without a manual reload.
      void publish.refresh();
      void useMonographsStore().load();
      for (const id of openNoteIds) {
        const after = notes.items.find((n) => n.id === id)?.dateEdited;
        if (after !== undefined && after !== before.get(id)) {
          notes.bumpNoteChanged(id);
        }
      }
    }
  );

  // React to a context change (login into an account, or logout to local
  // mode) WITHOUT a page reload — `auth` bumps `contextChangeSignal` after the
  // live-swap has made the new context's DB current. Reset the per-context view
  // (close tabs whose note ids belong to the old DB, drop previews/filter),
  // reload notes/collections from the now-current DB, and — when now logged in
  // — start a sync so the account's server data populates. Sync completion is
  // observed two ways: the `syncCompletedSignal` watch below (the primary
  // path, now that `bootstrap`/`switchContext` bridge `db.eventManager` → the
  // global `EV` the status store listens on), AND a reload on the `db.sync()`
  // promise resolution here as a belt-and-suspenders fallback (kept until the
  // bridge is on-site-verified; the resulting second reload is harmless and
  // can be dropped once the signal path is confirmed). (Boot into an
  // already-logged-in account is handled in `onMounted` above; this watch
  // covers mid-session login/logout, where a `location.reload()` proved
  // unreliable.)
  watch(
    () => auth.contextChangeSignal,
    async () => {
      if (!auth.showShell) return;
      const notes = useNotesStore();
      // Per-account client prefs (theme/transparency/locale/default templates/
      // block-colorize) are keyed by context in localStorage; reload them for
      // the now-current account. `loadClientPrefs` bumps the theme/transparency
      // signals when the values change, so the existing `themeChangeSignal` /
      // `transparencyChangeSignal` watches re-apply the renderer theme +
      // transparency below; `reloadLocale` re-applies the in-app locale.
      settings.loadClientPrefs();
      config.loadClientPrefs();
      reloadBlockColorize();
      reloadLocale();
      // Pause layout persistence across the context switch so the transient
      // empty state (after `resetView` → `closeAllTabs`) is never written to
      // disk for the NEW account — that would clobber its saved session. The
      // restored state is already on disk (loaded below), so resuming doesn't
      // need to force a save.
      setPersistenceSuppressed(true);
      notes.resetView();
      await notes.load();
      void useCollectionsStore().load();
      void useColorsStore().refresh();
      void useRemindersStore().refresh();
      void useNotebookIconsStore().load();
      void useTemplateNotebooksStore().load();
      // Re-bind the main window to the new context (main-side geometry writes
      // must land under the new account) and restore its saved session.
      bindContextToSession();
      await restoreSession(getCurrentContext());
      setPersistenceSuppressed(false);
      if (auth.isLoggedIn && config.syncEnabled && config.autoSyncEnabled) {
        void sync.startSync().then((ok) => {
          if (ok) void notes.load();
        });
      }
    }
  );
}
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
    <div class="relative flex min-h-0 flex-1">
      <!-- Route content: LoginScreen (no shell) or ShellLayout (TitleBar +
           Sidebar + routed view). The class is forwarded to the route root so
           it fills the content row (LoginScreen + ShellLayout both rely on it). -->
      <RouterView v-slot="{ Component }">
        <component :is="Component" class="min-w-0 flex-1 min-h-0" />
      </RouterView>

      <!-- Boot overlay -->
      <div
        v-if="bootState !== 'ready'"
        class="absolute inset-0 z-50 grid place-items-center bg-[var(--color-backdrop)] backdrop-blur-sm"
      >
        <div class="max-w-md rounded-lg border border-glass-border bg-glass-surface px-6 py-5 text-center">
          <template v-if="bootState === 'loading'">
            <div class="text-sm text-text-muted">{{ t("boot.initialising") }}</div>
          </template>
          <template v-else>
            <div class="text-sm font-medium text-[var(--paragraph-error)]">
              {{ dbLocked ? t("dbLocked.headline") : t("boot.startupFailed") }}
            </div>
            <div class="mt-2 text-xs text-text-muted">
              {{ dbLocked ? t("dbLocked.body") : bootError }}
            </div>
            <button
              class="titlebar-no-drag mt-4 rounded-md border border-glass-border bg-glass-hover px-3 py-1.5 text-xs text-text-main transition-colors hover:opacity-90"
              @click="retryBoot"
            >
              {{ t("boot.retry") }}
            </button>
            <button
              v-if="dbLocked"
              class="titlebar-no-drag mt-4 ml-2 rounded-md border border-glass-border px-3 py-1.5 text-xs text-[var(--accent-error)] transition-colors hover:opacity-90 disabled:opacity-50"
              :disabled="forceUnlocking"
              @click="forceUnlock"
            >
              {{ forceUnlocking ? t("boot.unlocking") : t("boot.forceUnlock") }}
            </button>
          </template>
        </div>
      </div>

      <!-- Right-click context menus (notes list + sidebar). Teleports to
           <body>; driven by useContextMenuStore. -->
      <ContextMenu />

      <!-- Date-picker popup (slash "Date" / palette "Insert date" commands).
           Teleports to <body>; driven by useInsertDateStore. -->
      <DatePickerPopup />

      <!-- Generic confirm dialog (destructive context-menu actions). Teleports
           to <body>; driven by useDialogStore. -->
      <ConfirmDialog />
      <NotebookPickerDialog />

      <!-- Color-editor dialog (note-row menu "New color…"). Teleports to
           <body>; driven by useColorDialogStore. -->
      <ColorEditorDialog />

      <!-- Link dialog (editor context menu "Link…" / "Edit link…"). Teleports
           to <body>; driven by useLinkDialogStore. -->
      <LinkDialog />

      <!-- Icon-picker dialog (notebook-row menu "Set icon…"). Teleports to
           <body>; driven by useIconDialogStore. -->
      <IconEditorDialog />

      <!-- Reminder-editor dialog (RemindersView "New reminder" / row "Edit").
           Teleports to <body>; driven by useReminderDialogStore. -->
      <ReminderEditorDialog />

      <!-- Publish-note dialog (editor toolbar ⋯ / note context menu /
           `app:publish-note` command). Teleports to <body>; driven by
           usePublishDialogStore. -->
      <PublishDialog />

      <!-- Semantic Search Onboarding Dialog (existing users updating for the first time).
           Prompted only when logged in. -->
      <SemanticSearchPromptDialog />
    </div>
  </div>
</template>