<!--
  Theme details dialog — a confirm-style modal shown when a catalog theme is
  clicked or a file is imported. Displays the `ThemePreview`, theme name +
  version, description, authors, license, and homepage/source links, with
  "Set as default" / "Cancel" actions. Self-contained (scoped to `ThemesSection`
  via a `v-if`), theme-token-driven (no hardcoded colours), and closes on
  Esc / outside-click / cancel.
-->
<script setup lang="ts">
import { watch, onBeforeUnmount } from "vue";
import ThemePreview from "./ThemePreview.vue";
import type { ThemeGridItem } from "@/composables/use-themes-catalog";

const props = defineProps<{ theme: ThemeGridItem; applying?: boolean }>();
const emit = defineEmits<{ (e: "confirm"): void; (e: "cancel"): void }>();

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    emit("cancel");
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (!props.theme.isApplied && !props.applying) emit("confirm");
  }
}
function onDown(e: MouseEvent): void {
  if (e.target === e.currentTarget) emit("cancel");
}

watch(
  () => props.theme,
  (t) => {
    if (t) window.addEventListener("keydown", onKeydown);
    else window.removeEventListener("keydown", onKeydown);
  },
  { immediate: true }
);
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div class="tdd__backdrop" @mousedown="onDown">
      <div class="tdd__panel" @mousedown.stop>
        <div class="tdd__preview-wrap">
          <ThemePreview :colors="theme.previewColors" />
        </div>
        <div class="tdd__title">{{ theme.name }} <span class="tdd__ver">v{{ theme.version }}</span></div>
        <p v-if="theme.description" class="tdd__desc">{{ theme.description }}</p>
        <div class="tdd__meta">
          <span v-if="theme.authors.length">by {{ theme.authors.map((a) => a.name).join(", ") }}</span>
          <span class="tdd__badge" :class="theme.colorScheme">{{ theme.colorScheme }}</span>
        </div>
        <div class="tdd__links">
          <a v-if="theme.homepage" :href="theme.homepage" target="_blank" rel="noreferrer">Website</a>
          <a v-if="theme.sourceURL" :href="theme.sourceURL" target="_blank" rel="noreferrer">Source</a>
          <span class="tdd__license">License: {{ theme.license }}</span>
        </div>
        <div class="tdd__actions">
          <button class="tdd__btn tdd__btn--cancel" @click="emit('cancel')">Cancel</button>
          <button
            class="tdd__btn tdd__btn--confirm"
            :disabled="theme.isApplied || applying"
            @click="emit('confirm')"
          >
            {{
              theme.isApplied
                ? "Applied"
                : applying
                  ? "Installing…"
                  : `Set as ${theme.colorScheme === "dark" ? "Dark" : "Light"} theme`
            }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tdd__backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: var(--color-backdrop, color-mix(in srgb, black 40%, transparent));
  backdrop-filter: blur(2px);
}
.tdd__panel {
  width: min(420px, 92vw);
  padding: 18px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-solid);
  box-shadow: 0 12px 40px color-mix(in srgb, black 50%, transparent);
  color: var(--color-text);
  font-size: 13px;
}
.tdd__preview-wrap {
  margin-bottom: 12px;
}
.tdd__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-heading);
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.tdd__ver {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-muted);
}
.tdd__desc {
  margin: 8px 0;
  line-height: 1.45;
  color: var(--color-text);
}
.tdd__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.tdd__badge {
  text-transform: capitalize;
  padding: 1px 6px;
  border-radius: 9999px;
  background: var(--color-hover);
  color: var(--color-text);
}
.tdd__links {
  margin-top: 8px;
  font-size: 11px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.tdd__links a {
  color: var(--color-accent);
  text-decoration: none;
}
.tdd__links a:hover {
  text-decoration: underline;
}
.tdd__license {
  color: var(--color-text-muted);
}
.tdd__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.tdd__btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.tdd__btn:hover {
  background: var(--color-hover);
}
.tdd__btn--confirm {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
  border-color: var(--color-accent);
}
.tdd__btn--confirm:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>