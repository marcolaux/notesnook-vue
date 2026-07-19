<script setup lang="ts">
/**
 * Authenticated shell layout (Phase 3.5): TitleBar + Sidebar + the routed
 * content area (`<RouterView>` renders NotesView / SettingsView / a
 * PlaceholderView). Login is a separate top-level route *outside* this layout.
 */
import { useShellStore } from "@/stores/shell";
import TitleBar from "@/components/TitleBar.vue";
import Sidebar from "@/components/Sidebar.vue";

const shell = useShellStore();
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 min-w-0 flex-col">
    <TitleBar />
    <div class="relative flex min-h-0 flex-1">
      <Sidebar
        v-show="!shell.sidebarCollapsed"
        class="w-60 shrink-0 border-r border-white/10 backdrop-blur-2xl"
      />
      <RouterView />
    </div>
  </div>
</template>