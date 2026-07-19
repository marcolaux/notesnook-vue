<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import Sidebar from "@/components/Sidebar.vue";
import NotesList from "@/components/NotesList.vue";
import Editor from "@/components/Editor.vue";
import TitleBar from "@/components/TitleBar.vue";
import LoginScreen from "@/components/LoginScreen.vue";
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";
import { bootstrap } from "@/platform/bootstrap";
import { useCommandPalette } from "@/composables/use-command-palette";

const sidebarCollapsed = ref(false);
const listCollapsed = ref(false);

const bootState = ref<"loading" | "ready" | "error">("loading");
const bootError = ref<string>("");

const auth = useAuthStore();

// Command palette hotkey (Ctrl/Cmd+Shift+P). The overlay render is a deferred
// follow-up; this only wires the global key + palette store toggle.
useCommandPalette();

onMounted(async () => {
  const notes = useNotesStore();
  try {
    await bootstrap();
    await auth.init();
    if (auth.showShell) await notes.load();
    bootState.value = "ready";
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
// chose local-only via "Continue without account").
const notesLoaded = ref(false);
watch(
  () => auth.showShell,
  async (show) => {
    if (show && !notesLoaded.value) {
      notesLoaded.value = true;
      await useNotesStore().load();
    }
  }
);
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
    <TitleBar
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
    />
    <div class="relative flex min-h-0 flex-1">
      <!-- Notes shell (logged in, or local-only) -->
      <template v-if="bootState === 'ready' && auth.showShell">
        <Sidebar
          v-show="!sidebarCollapsed"
          class="w-60 shrink-0 border-r border-white/10 backdrop-blur-2xl"
        />
        <NotesList
          v-show="!listCollapsed"
          :sidebar-collapsed="sidebarCollapsed"
          class="w-80 shrink-0 border-r border-white/10 backdrop-blur-xl"
          @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
        />
        <Editor class="min-w-0 flex-1 backdrop-blur-2xl" />
      </template>

      <!-- Login screen (logged-out and not skipped) -->
      <LoginScreen v-else-if="bootState === 'ready'" class="min-w-0 flex-1" />

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
    </div>
  </div>
</template>