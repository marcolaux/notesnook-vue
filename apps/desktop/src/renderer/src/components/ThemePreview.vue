<!--
  Theme preview card — a Vue port of upstream `apps/web/src/components/theme-preview`.
  Renders a miniature app mock (nav / list / editor panes + status bar + 3 corner
  swatches) from a theme's `PreviewColors`, so the themes grid can show what each
  theme looks like without applying it. All colours are inline-bound (they're
  per-theme, so Tailwind utilities can't express them).
-->
<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { PreviewColors } from "@notesnook-vue/theme-vue";

defineProps<{ colors: PreviewColors }>();

const { t } = useI18n();

/** Mix a hex colour toward transparent at `pct`% for the accent-tinted card bg. */
function tint(hex: string, pct: number): string {
  return `color-mix(in srgb, ${hex} ${pct}%, transparent)`;
}
</script>

<template>
  <div
    class="theme-preview"
    :style="{ background: tint(colors.accent, 20), borderColor: colors.accent }"
  >
    <div class="ui">
      <!-- nav strip -->
      <div
        class="nav"
        :style="{ background: colors.navigationMenu.background, borderColor: colors.border }"
      >
        <span class="nav-dot" :style="{ background: colors.navigationMenu.accent }"></span>
        <span class="nav-dot" :style="{ background: colors.navigationMenu.icon }"></span>
        <span class="nav-dot" :style="{ background: colors.navigationMenu.icon }"></span>
        <span class="nav-dot" :style="{ background: colors.navigationMenu.icon }"></span>
      </div>
      <!-- list pane -->
      <div
        class="list"
        :style="{ background: colors.list.background, borderColor: colors.border }"
      >
        <div class="list-head" :style="{ color: colors.list.heading }">{{ t("themePreview.notesLabel") }}</div>
        <div class="list-add" :style="{ background: colors.list.accent, color: colors.list.accentForeground }">
          +
        </div>
      </div>
      <!-- editor pane -->
      <div class="editor" :style="{ background: colors.editor }"></div>
    </div>
    <!-- status bar -->
    <div
      class="statusbar"
      :style="{ background: colors.statusBar.background, borderColor: colors.border }"
    >
      <span class="status-dot" :style="{ background: colors.statusBar.icon }"></span>
      <span class="status-email" :style="{ color: colors.statusBar.paragraph }">johndoe@email.com</span>
    </div>
    <!-- corner swatches -->
    <div class="swatches">
      <span class="sw" :style="{ background: colors.accent }"></span>
      <span class="sw" :style="{ background: colors.paragraph }"></span>
      <span class="sw" :style="{ background: colors.background }"></span>
    </div>
  </div>
</template>

<style scoped>
.theme-preview {
  position: relative;
  height: 132px;
  border: 2px solid;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ui {
  flex: 1;
  display: flex;
  min-height: 0;
}
.nav {
  width: 22px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  padding-top: 8px;
  border-right: 1px solid;
}
.nav-dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
}
.list {
  flex: 0 0 32%;
  padding: 6px 7px;
  border-right: 1px solid;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.list-head {
  font-size: 8px;
  font-weight: 600;
}
.list-add {
  align-self: flex-start;
  width: 13px;
  height: 13px;
  border-radius: 9999px;
  display: grid;
  place-items: center;
  font-size: 10px;
  line-height: 1;
}
.editor {
  flex: 1;
}
.statusbar {
  height: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 5px;
  border-top: 1px solid;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
}
.status-email {
  font-size: 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.swatches {
  position: absolute;
  right: 7px;
  bottom: 16px;
  display: flex;
}
.sw {
  width: 15px;
  height: 15px;
  border-radius: 9999px;
  border: 1.5px solid rgba(0, 0, 0, 0.15);
  margin-left: -6px;
}
.sw:first-child {
  margin-left: 0;
}
</style>