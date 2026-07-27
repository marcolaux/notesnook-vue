<!--
  Theme card — one row in the themes grid. Shows the `ThemePreview`, the theme
  name + first author, a Dark/Light badge, install count, and either an applied
  check or a "Set as Dark/Light theme" button. Card click opens the details
  dialog; the button installs directly (like upstream's two paths).
-->
<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ThemePreview from "./ThemePreview.vue";
import type { ThemeGridItem } from "@/composables/use-themes-catalog";

defineProps<{ theme: ThemeGridItem }>();

defineEmits<{
  /** Card body click — open the details dialog. */
  (e: "open"): void;
  /** "Set as … theme" button — install directly. */
  (e: "set"): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="theme-card"
    :class="{ 'is-applied': theme.isApplied }"
    @click="$emit('open')"
  >
    <ThemePreview :colors="theme.previewColors" />
    <div class="meta">
      <div class="name" :title="theme.name">{{ theme.name }}</div>
      <div class="sub">
        <span class="badge" :class="theme.colorScheme">{{ theme.colorScheme }}</span>
        <span v-if="theme.authors.length" class="author" :title="theme.authors[0]?.name">
          · {{ theme.authors[0]?.name }}
        </span>
      </div>
      <div v-if="theme.totalInstalls" class="installs">{{ t("themeDetails.installs", { n: theme.totalInstalls }) }}</div>
    </div>
    <div class="actions">
      <span v-if="theme.isApplied" class="applied">✓ {{ t("themeDetails.applied") }}</span>
      <button v-else type="button" class="set-btn" @click.stop="$emit('set')">
        {{ theme.colorScheme === "dark" ? t("themeDetails.setAsDark") : t("themeDetails.setAsLight") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  transition: background-color 0.15s;
  background: color-mix(in srgb, var(--color-surface) 60%, transparent);
}
.theme-card:hover {
  background: var(--color-hover);
}
.theme-card.is-applied {
  border-color: var(--color-accent);
}
.meta {
  margin-top: 8px;
}
.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.badge {
  text-transform: capitalize;
  padding: 1px 6px;
  border-radius: 9999px;
  background: var(--color-hover);
  color: var(--color-text);
}
.author {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.installs {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  min-height: 26px;
  align-items: center;
}
.set-btn {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background-color 0.15s;
}
.theme-card:hover .set-btn {
  opacity: 1;
}
.set-btn:hover {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
  border-color: var(--color-accent);
}
.applied {
  font-size: 11px;
  color: var(--color-accent);
  font-weight: 600;
}
</style>