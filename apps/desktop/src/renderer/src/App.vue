<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { useAuthStore } from "@/stores/auth";
import { useStatusStore } from "@/stores/status";
import { useVaultStore } from "@/stores/vault";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { bootstrap } from "@/platform/bootstrap";
import { useCommandPalette } from "@/composables/use-command-palette";
import CommandPalette from "@/components/CommandPalette.vue";

const router = useRouter();

const bootState = ref<"loading" | "ready" | "error">("loading");
const bootError = ref<string>("");

const auth = useAuthStore();
const status = useStatusStore();
const vault = useVaultStore();
const editorLayout = useEditorLayoutStore();

// Command palette hotkey (Ctrl/Cmd+Shift+P) toggles the palette store; the
// <CommandPalette> overlay below renders the store's items.
useCommandPalette();

onMounted(async () => {
  const notes = useNotesStore();
  const collections = useCollectionsStore();
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

// Load notes the first time the shell becomes visible (logged in, or the user
// chose local-only via "Continue without account"). Also re-seed the sync
// status — after a login `lastSynced` may have changed.
const notesLoaded = ref(false);
watch(
  () => auth.showShell,
  async (show) => {
    if (show && !notesLoaded.value) {
      notesLoaded.value = true;
      await useNotesStore().load();
      void useCollectionsStore().load();
      void status.refreshSync();
      void vault.refresh();
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