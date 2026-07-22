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
import CollapsiblePanel from "@/components/CollapsiblePanel.vue";

const shell = useShellStore();
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 min-w-0 flex-col">
    <TitleBar />
    <div class="relative flex min-h-0 flex-1">
      <CollapsiblePanel
        :visible="!shell.sidebarCollapsed && !shell.focusMode"
        :width="shell.sidebarWidth"
        :min="SIDEBAR_MIN"
        :max="SIDEBAR_MAX"
        @resize="shell.setSidebarWidth"
      >
        <Sidebar class="h-full backdrop-blur-2xl" />
      </CollapsiblePanel>
      <RouterView />
    </div>
  </div>
</template>