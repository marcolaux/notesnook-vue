<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useAuthStore } from "@/stores/auth";
import { useStatusStore } from "@/stores/status";
import { useVaultStore } from "@/stores/vault";
import { useBackupsStore } from "@/stores/backup";
import { useSpellCheckerStore } from "@/stores/spell-checker";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useSettingsStore } from "@/stores/settings";
import { bootstrap } from "@/platform/bootstrap";
import { desktop } from "@/platform/desktop-bridge";
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

const auth = useAuthStore();
const status = useStatusStore();
const vault = useVaultStore();
const backups = useBackupsStore();
const spellChecker = useSpellCheckerStore();
const editorLayout = useEditorLayoutStore();
const settings = useSettingsStore();

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

let mediaCleanup: (() => void) | undefined;
function bindSystemThemeListener(): void {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (settings.themeMode === "system") applyTheme("system");
  };
  mq.addEventListener("change", onChange);
  mediaCleanup = () => mq.removeEventListener("change", onChange);
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
    try {
      await bootstrap();
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

  // Apply the stored theme on boot (corrects bootstrap's dark default to the
  // user's choice) + listen for OS preference changes while in system mode.
  applyTheme(settings.themeMode);
  bindSystemThemeListener();

  try {
    await bootstrap();
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
    if (auth.showShell) {
      await notes.load();
      void collections.load();
    }
    bootState.value = "ready";
    // Settle the initial route now that auth is resolved. During boot the
    // guard saw `status === "unknown"` and let the redirect to `/all` through;
    // here we move to `/login` if the user is logged-out and not local-only.
    void router.replace(auth.showShell ? "/all" : "/login");
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
        <div class="max-w-md rounded-lg border border-white/10 bg-white/5 px-6 py-5 text-center">
          <template v-if="bootState === 'loading'">
            <div class="text-sm text-white/70">Initialising database…</div>
          </template>
          <template v-else>
            <div class="text-sm font-medium text-red-300">Startup failed</div>
            <div class="mt-2 text-xs text-white/50">{{ bootError }}</div>
          </template>
        </div>
      </div>

      <!-- Command palette overlay (Ctrl/Cmd+Shift+P). Teleports to <body>;
           stays mounted so it is available on the shell and login screen. -->
      <CommandPalette />
    </div>
  </div>
</template>