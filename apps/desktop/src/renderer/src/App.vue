<script setup lang="ts">
import { ref, onMounted } from "vue";
import Sidebar from "@/components/Sidebar.vue";
import NotesList from "@/components/NotesList.vue";
import Editor from "@/components/Editor.vue";
import TitleBar from "@/components/TitleBar.vue";
import { useNotesStore } from "@/stores/notes";
import { bootstrap } from "@/platform/bootstrap";

const sidebarCollapsed = ref(false);
const listCollapsed = ref(false);

const bootState = ref<"loading" | "ready" | "error">("loading");
const bootError = ref<string>("");

onMounted(async () => {
  const notes = useNotesStore();
  try {
    await bootstrap();
    await notes.load();
    bootState.value = "ready";
  } catch (e) {
    bootState.value = "error";
    bootError.value = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[boot]", e);
  }
});
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
    <TitleBar
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
    />
    <div class="relative flex min-h-0 flex-1">
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