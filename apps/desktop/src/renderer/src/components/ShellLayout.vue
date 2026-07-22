<script setup lang="ts">
/**
 * Authenticated shell layout (Phase 3.5): TitleBar + Sidebar + the routed
 * content area (`<RouterView>` renders NotesView / SettingsView / a
 * PlaceholderView). Login is a separate top-level route *outside* this layout.
 */
import { useShellStore } from "@/stores/shell";
import { SIDEBAR_MIN, SIDEBAR_MAX } from "@/utils/resizer";
import TitleBar from "@/components/TitleBar.vue";
import Sidebar from "@/components/Sidebar.vue";
import Resizer from "@/components/Resizer.vue";

const shell = useShellStore();
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 min-w-0 flex-col">
    <TitleBar />
    <div class="relative flex min-h-0 flex-1">
      <Sidebar
        v-show="!shell.sidebarCollapsed && !shell.focusMode"
        class="shrink-0 backdrop-blur-2xl"
        :style="{ width: shell.sidebarWidth + 'px' }"
      />
      <Resizer
        v-show="!shell.sidebarCollapsed && !shell.focusMode"
        :width="shell.sidebarWidth"
        :min="SIDEBAR_MIN"
        :max="SIDEBAR_MAX"
        @resize="shell.setSidebarWidth"
      />
      <RouterView />
    </div>
  </div>
</template>