<script setup lang="ts">
/**
 * Settings window layout (Phase 7.0 on-site) — the root rendered by the
 * separate Settings `BrowserWindow` (top-level `/settings` route). A minimal
 * drag titlebar (no sidebar toggle — Settings has no sidebar) + the existing
 * `SettingsView` form. Padding reuses `useTitleBarStore` so the drag label
 * clears the OS-drawn window controls (macOS traffic lights / Windows WCO),
 * matching the main window's `TitleBar`.
 */
import { useTitleBarStore } from "@/stores/titlebar";
import SettingsView from "./SettingsView.vue";

const titlebar = useTitleBarStore();
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
    <div
      class="titlebar-drag flex h-10 shrink-0 items-center border-b border-white/10 bg-white/5 backdrop-blur-2xl"
      :style="{ paddingLeft: titlebar.padding.left + 'px', paddingRight: titlebar.padding.right + 'px' }"
    >
      <div class="px-2 text-xs font-medium text-white/80">Settings</div>
    </div>
    <SettingsView />
  </div>
</template>