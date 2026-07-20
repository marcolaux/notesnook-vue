<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useAuthStore } from "@/stores/auth";
import { useStatusStore } from "@/stores/status";
import { useSyncStore } from "@/stores/sync";
import { useVaultStore } from "@/stores/vault";
import { useBackupsStore } from "@/stores/backup";
import { useSpellCheckerStore } from "@/stores/spell-checker";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useShellStore } from "@/stores/shell";
import { useSettingsStore, THEME_MODE_KEY } from "@/stores/settings";
import { useConfigStore } from "@/stores/config";
import { useUpstreamNotifierStore } from "@/stores/upstream-notifier";
import { bootstrap } from "@/platform/bootstrap";
import { desktop } from "@/platform/desktop-bridge";
import { dropZoneFromPoint } from "@/utils/tab-dnd";
import { setTheme, ThemeDark, ThemeLight } from "@notesnook-vue/theme-vue";
import { useCommandPalette } from "@/composables/use-command-palette";
import CommandPalette from "@/components/CommandPalette.vue";

const router = useRouter();

const bootState = ref<"loading" | "ready" | "error">("loading");
const bootError = ref<string>("");

// The separate Settings window loads the renderer with `?window=settings`.
// It runs a *minimal* boot (DB + settings + spell-check + i18n only) and
// routes to the top-level `/settings` — no auth/sync/vault/notes, and none of
// the shell-only watches below (those would redirect to /login since auth is
// never initialised in this window).
const isSettingsWindow =
  typeof URLSearchParams !== "undefined" &&
  new URLSearchParams(location.search).get("window") === "settings";

// A torn-off note window (multi-window) loads the renderer with
// `?window=note&noteId=<id>`. It runs the *normal* full-shell boot (not the
// settings minimal boot), then enables focus mode (hides sidebar + notes list)
// and opens the note as a tab. One window per note — the main process focuses
// an existing note window instead of creating a duplicate.
const windowType =
  typeof URLSearchParams !== "undefined" ? new URLSearchParams(location.search).get("window") : null;
const isNoteWindow = windowType === "note";
const noteWindowNoteId = isNoteWindow
  ? new URLSearchParams(location.search).get("noteId")
  : null;

const auth = useAuthStore();
const status = useStatusStore();
const sync = useSyncStore();
const vault = useVaultStore();
const backups = useBackupsStore();
const spellChecker = useSpellCheckerStore();
const editorLayout = useEditorLayoutStore();
const settings = useSettingsStore();
const upstreamNotifier = useUpstreamNotifierStore();
const config = useConfigStore();

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
  setTheme(effective === "dark" ? ThemeDark : ThemeLight);
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
  setTheme(effective === "dark" ? ThemeDark : ThemeLight);
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
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_MODE_KEY && (e.newValue === "light" || e.newValue === "dark" || e.newValue === "system")) {
      // Mirror the new mode into this window's store (no signal bump — see
      // `syncThemeMode`) so the system-mode OS-preference listener etc. see
      // the right value, then re-apply the renderer CSS.
      settings.syncThemeMode(e.newValue);
      applyThemeCss(e.newValue);
    }
  };
  window.addEventListener("storage", onStorage);
  storageCleanup = () => window.removeEventListener("storage", onStorage);
}

// Command palette hotkey (Ctrl/Cmd+Shift+P) toggles the palette store; the
// <CommandPalette> overlay below renders the store's items.
useCommandPalette();

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

onMounted(async () => {
  // --- Settings window: minimal boot -------------------------------------
  // No deep-link/tray/close-tab subscriptions (those are main-window only),
  // no auth.init (auth.status stays "unknown" → the guard allows /settings),
  // no sync/vault/editor-layout/notes/collections. Just the DB (for
  // db.settings), the settings store, the spell-checker snapshot, i18n, and
  // the theme. Then route to /settings and surface the UI.
  if (isSettingsWindow) {
    applyTheme(settings.themeMode);
    bindSystemThemeListener();
    bindCrossWindowThemeListener();
    try {
      await bootstrap();
      // `bootstrap()` injects `ThemeDark` as its no-flash default, overwriting
      // the pre-bootstrap `applyTheme` above — re-apply the user's persisted
      // choice so the settings window matches the app theme (not stuck dark).
      applyTheme(settings.themeMode);
      await settings.load();
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

  // Subscribe to deep-link note events as early as possible so a cold-start
  // `nn://note/<id>` (queued in main until the page loads) is not missed.
  window.appEvents?.onOpenNote((noteId) => openNoteFromDeepLink(noteId));
  // Cross-window tab drop: main forwards the release point (client coords) when
  // a tab dragged from another window lands on this window. Decides split-vs-
  // move from the cursor position over our editor body (HTML5 `dataTransfer`
  // doesn't cross windows, so our drop handlers never fired).
  window.appEvents?.onOpenNoteAt((payload) => openNoteAt(payload));

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

  // Apply the stored theme on boot (corrects bootstrap's dark default to the
  // user's choice) + listen for OS preference changes while in system mode.
  // Also bind the cross-window theme listener so a theme change made in the
  // Settings window re-applies here (the main window).
  applyTheme(settings.themeMode);
  bindSystemThemeListener();
  bindCrossWindowThemeListener();

  try {
    await bootstrap();
    // `bootstrap()` injects `ThemeDark` as its no-flash default, overwriting
    // the pre-bootstrap `applyTheme` above — re-apply the user's persisted
    // choice so a fresh boot matches the saved theme (not stuck dark).
    applyTheme(settings.themeMode);
    await auth.init();
    // Initialise the editor-layout store (root group) so the single-pane
    // editor has a group to open tabs in. Idempotent. Multi-pane splits are
    // Phase 4.2/4.3 (on-site).
    editorLayout.init();
    // Bind sync events once (idempotent) and seed the status bar's sync
    // state from `db.lastSynced()`; safe even when not logged in — the view
    // renders "Local only" until login, and `refreshSync` only queries the
    // local lastSynced timestamp. Start the wall-clock so relative sync
    // times stay accurate.
    status.bindSyncEvents();
    status.startClock();
    void status.refreshSync();
    // If booting into an already-logged-in account (cached user — e.g. a
    // return visit, or right after login's reload), pull the account's server
    // data. A fresh login also lands here after its reload. Local mode is
    // unaffected (sync is auth-gated; without a token it surfaces as
    // `lastError` and is ignored). Skipped in a torn-off note window — the
    // main window owns sync to avoid double-sync across windows; the note
    // window still binds sync events above for status display.
    if (auth.isLoggedIn && config.syncEnabled && !isNoteWindow) void sync.startSync();
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
    // In-app upstream-release notifier (main window only — the StatusBar
    // indicator lives here, and the shared localStorage throttle prevents a
    // note window from re-checking). Fire-and-forget: a GitHub outage never
    // blocks boot. Privacy-toggle-gated + once-per-24h inside the store.
    if (!isNoteWindow) void upstreamNotifier.maybeCheck();
    if (auth.showShell) {
      await notes.load();
      void collections.load();
    }
    bootState.value = "ready";
    // Settle the initial route now that auth is resolved. During boot the
    // guard saw `status === "unknown"` and let the redirect to `/all` through;
    // here we move to `/login` if the user is logged-out and not local-only.
    void router.replace(auth.showShell ? "/all" : "/login");
    // Torn-off note window: enable focus mode (hides sidebar + notes list) and
    // open the note as a tab. Only when the shell is visible — a note window
    // torn from a logged-in/local-only session always has a shell; if auth
    // somehow isn't resolved the deep-link-style flush below catches it.
    if (isNoteWindow && noteWindowNoteId && auth.showShell) {
      useShellStore().setFocusMode(true);
      void router.push("/all").then(() => useNotesStore().selectNote(noteWindowNoteId));
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
    () => auth.showShell,
    async (show) => {
      if (show && !notesLoaded.value) {
        notesLoaded.value = true;
        await useNotesStore().load();
        void useCollectionsStore().load();
        void status.refreshSync();
        void vault.refresh();
        void backups.refresh();
        void spellChecker.refresh();
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
  // watch handles every subsequent transition (logout, login, skip, request).
  watch(
    () => auth.showShell,
    (show) => {
      void router.replace(show ? "/all" : "/login");
    }
  );

  // Reload notes + collections whenever a sync completes so freshly-synced
  // server data (the account's notes pulled down after login, or later changes
  // from other devices) appears in the list without a manual refresh. The
  // status store bumps `syncCompletedSignal` on each `syncCompleted` event.
  watch(
    () => status.syncCompletedSignal,
    () => {
      if (!auth.showShell) return;
      void useNotesStore().load();
      void useCollectionsStore().load();
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
      notes.resetView();
      await notes.load();
      void useCollectionsStore().load();
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
        class="absolute inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      >
        <div class="max-w-md rounded-lg border border-glass-border bg-glass-surface px-6 py-5 text-center">
          <template v-if="bootState === 'loading'">
            <div class="text-sm text-text-muted">Initialising database…</div>
          </template>
          <template v-else>
            <div class="text-sm font-medium text-red-400">Startup failed</div>
            <div class="mt-2 text-xs text-text-muted">{{ bootError }}</div>
          </template>
        </div>
      </div>

      <!-- Command palette overlay (Ctrl/Cmd+Shift+P). Teleports to <body>;
           stays mounted so it is available on the shell and login screen. -->
      <CommandPalette />
    </div>
  </div>
</template>