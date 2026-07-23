<script setup lang="ts">
/**
 * Shared right-sidebar shell (Phase 5.2 — ToC/Minimap + note-history).
 *
 * A floating, rounded, heavy-glassmorphism panel that sits to the right of the
 * editor inside a pane. Both the per-tab note-history timeline
 * (`HistorySidebar`) and the per-tab ToC/Minimap panel (`TocSidebar`) render
 * their content inside this shell so the two right-side panels read as one
 * visual family: rounded edges, translucent glass surface, extra backdrop
 * blur, and a soft shadow — rather than the old flat full-height `border-l`
 * strip.
 *
 * Slots:
 *  - `#title`   — the header label (a string or small markup).
 *  - `#actions` — header-right controls (e.g. the ToC/Minimap segment toggle).
 *  - default    — the scrollable body.
 *
 * Emits `close` for the × button (the caller decides what "close" means —
 * `layout.toggleHistory(tabId)` / `layout.toggleToc(tabId)`).
 */
import { useI18n } from "vue-i18n";
import { Icon } from "@notesnook-vue/ui-vue";

defineSlots<{
  title(): unknown;
  actions?(): unknown;
  default(): unknown;
}>();

defineEmits<{ close: [] }>();

const { t } = useI18n();
</script>

<template>
  <div
    class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-glass-border bg-glass-surface shadow-xl backdrop-blur-xl"
  >
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-b border-glass-border px-3 py-2"
    >
      <span class="truncate text-xs font-medium text-text"><slot name="title" /></span>
      <div class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
        <button
          type="button"
          class="grid h-6 w-6 shrink-0 place-items-center rounded text-text-muted hover:bg-glass-hover hover:text-text"
          :title="t('common.close')"
          @click="$emit('close')"
        >
          <Icon name="x" :size="16" />
        </button>
      </div>
    </div>
    <div class="relative flex min-h-0 flex-1 flex-col overflow-auto px-3 py-2">
      <slot />
    </div>
  </div>
</template>