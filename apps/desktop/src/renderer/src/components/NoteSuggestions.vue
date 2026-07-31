<!--
  Proactive suggestion overlay — a floating, rounded glass pill that hovers
  just below the editor toolbar. Shows clickable notebook / tag / color chips
  derived from the most similar existing notes (`use-note-suggestions` +
  `utils/note-similarity`).

  Visual identity mirrors the right sidebar (`RightSidebar.vue`): the same
  glass tokens (`bg-glass-surface` / `border-glass-border` / `backdrop-blur-xl`
  / `shadow-xl`) and `rounded-xl` corners, but floating as a content-width bar
  inset from the editor edges rather than a full-height side panel. Fades in
  from the top (translateY + opacity) on appear; fades up out on dismiss.

  Rendered by `Editor.vue` only while `sug.open` is true (gate passed + a
  non-empty, confidence-gated result). One-click assigns via the emitted
  events; assigning any one of notebook/tag/color closes the overlay (the
  all-three-absent gate flips). Dismissed via the × button or Escape; it then
  stays hidden for that note until ~40 more words are added.
-->
<script setup lang="ts">
import { nextTick, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { Icon } from "@notesnook-vue/ui-vue";
import { useHorizontalWheelScroll } from "@/composables/use-horizontal-wheel-scroll";
import type { NoteSuggestions } from "@/utils/note-similarity";

const props = defineProps<{ suggestions: NoteSuggestions; keyboardActive?: boolean }>();
const emit = defineEmits<{
  assignNotebook: [id: string];
  assignTag: [id: string];
  assignColor: [id: string];
  openNote: [id: string];
  linkNote: [id: string];
  dismiss: [];
}>();

// Translate vertical wheel into horizontal scroll on the chip strip (same as the
// editor toolbar + tab strip), so a wheel scroll over the suggestions moves the
// chips sideways instead of being stuck.
const scrollRef = ref<HTMLElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
useHorizontalWheelScroll(scrollRef);

/** Flat list of navigable buttons inside the pill (notebook / tag / color
 *  chips, each related-note's open + link buttons, and the dismiss button) in
 *  DOM order. Recollected per keypress — cheap (~12 buttons) and resilient to
 *  the chip set changing under a re-run. */
function navItems(): HTMLButtonElement[] {
  if (!rootRef.value) return [];
  return Array.from(rootRef.value.querySelectorAll<HTMLButtonElement>("button"));
}
let activeIndex = -1;

function focusItem(i: number): void {
  const list = navItems();
  if (!list.length) return;
  const idx = ((i % list.length) + list.length) % list.length;
  activeIndex = idx;
  const el = list[idx];
  if (!el) return;
  el.focus();
  // Keep the focused chip within the (horizontally scrollable) strip.
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Pill-scoped keydown — fires while a chip has focus (so it never fights
 *  editor typing, which keeps focus in the editor). Arrow keys cycle through
 *  the chips; Enter/Space activate the focused chip natively. Home/End jump to
 *  the first/last. Escape dismisses (the window listener is the global
 *  backstop for when focus is elsewhere). */
function onNavKey(e: KeyboardEvent): void {
  const list = navItems();
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    focusItem(activeIndex < 0 ? 0 : activeIndex + 1);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    focusItem(activeIndex < 0 ? list.length - 1 : activeIndex - 1);
  } else if (e.key === "Home") {
    e.preventDefault();
    focusItem(0);
  } else if (e.key === "End") {
    e.preventDefault();
    focusItem(list.length - 1);
  } else if (e.key === "Escape") {
    emit("dismiss");
  }
}

function onWindowKey(e: KeyboardEvent): void {
  if (e.key === "Escape") emit("dismiss");
}

/** When summoned manually (`keyboardActive`), auto-focus the first chip so the
 *  user can navigate immediately without a Tab. Re-runs when the suggestion
 *  set is replaced (the re-run swaps chips) so a stale position is reset to the
 *  first chip rather than landing on a vanished element. */
watch(
  () => [props.keyboardActive, props.suggestions] as const,
  ([kb]) => {
    if (!kb) {
      activeIndex = -1;
      return;
    }
    void nextTick(() => focusItem(0));
  },
  { immediate: true }
);

onMounted(() => window.addEventListener("keydown", onWindowKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKey));
</script>

<template>
  <Transition name="ns-fade-down">
    <!-- Outer container is invisible to pointer events so clicks on the editor
         area around the pill pass through; only the pill itself is interactive. -->
    <div class="pointer-events-none absolute inset-x-0 top-9 z-20">
      <div
        ref="rootRef"
        class="note-suggestions pointer-events-auto mx-3 mt-1.5 inline-flex max-w-[calc(100%-1.5rem)] items-center rounded-xl border border-glass-border bg-glass-surface py-1.5 pl-3 pr-1.5 shadow-xl backdrop-blur-xl"
        role="region"
        aria-label="Suggested notebooks, tags, and colors"
        @keydown="onNavKey"
      >
        <!-- Scrollable chip strip. The dismiss button is a SIBLING outside this
             scroll area (below) so it stays pinned at the right edge even when the
             chips overflow horizontally — otherwise a long list hides the close
             button at the scroll end. -->
        <div
          ref="scrollRef"
          class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
        >
        <Icon name="sparkles" :size="12" class="shrink-0 text-text-muted" />
        <span class="shrink-0 pr-0.5 text-xs font-medium text-text-muted">Suggested</span>

        <!-- Notebooks -->
        <button
          v-for="nb in suggestions.notebooks"
          :key="'nb-' + nb.id"
          type="button"
          class="ns-chip"
          :title="nb.title"
          @click="emit('assignNotebook', nb.id)"
        >
          <Icon name="book" :size="12" class="shrink-0 opacity-70" />
          <span class="truncate">{{ nb.title }}</span>
        </button>

        <span
          v-if="suggestions.notebooks.length && suggestions.tags.length"
          class="ns-divider"
        />

        <!-- Tags -->
        <button
          v-for="t in suggestions.tags"
          :key="'tag-' + t.id"
          type="button"
          class="ns-chip"
          :title="t.title"
          @click="emit('assignTag', t.id)"
        >
          <Icon name="hash" :size="12" class="shrink-0 opacity-70" />
          <span class="truncate">{{ t.title }}</span>
        </button>

        <span
          v-if="suggestions.colors.length && (suggestions.notebooks.length || suggestions.tags.length)"
          class="ns-divider"
        />

        <!-- Colors -->
        <button
          v-for="c in suggestions.colors"
          :key="'col-' + c.id"
          type="button"
          class="ns-chip"
          :title="c.title"
          @click="emit('assignColor', c.id)"
        >
          <span class="ns-swatch" :style="{ background: c.colorCode }" />
          <span class="truncate">{{ c.title }}</span>
        </button>

        <!-- Related notes (open / link) — shown whenever similar notes were found,
             even if no notebook/tag/color passed the confidence gate. -->
        <span
          v-if="suggestions.notes.length && (suggestions.notebooks.length || suggestions.tags.length || suggestions.colors.length)"
          class="ns-divider"
        />
        <template v-if="suggestions.notes.length">
          <span class="shrink-0 pr-0.5 text-xs font-medium text-text-muted">Related</span>
          <span
            v-for="n in suggestions.notes"
            :key="'note-' + n.id"
            class="ns-note"
            :title="n.title"
          >
            <button
              type="button"
              class="ns-note-open"
              @click="emit('openNote', n.id)"
            >
              <Icon name="file-text" :size="12" class="shrink-0 opacity-70" />
              <span class="truncate">{{ n.title }}</span>
            </button>
            <button
              type="button"
              class="ns-note-link"
              title="Link to this note"
              aria-label="Link to this note"
              @click="emit('linkNote', n.id)"
            >
              <Icon name="link" :size="12" />
            </button>
          </span>
        </template>
        </div>

        <button
          type="button"
          class="ns-dismiss ml-1 shrink-0"
          title="Dismiss"
          aria-label="Dismiss suggestions"
          @click="emit('dismiss')"
        >
          <Icon name="x" :size="12" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Chips + dismiss use the codebase's glass interaction tints (paragraph-derived
   via the @theme bridge) so they read on the pill's translucent surface. */
/* Visible keyboard-focus ring for arrow-key navigation (the pill auto-focuses
   the first chip when summoned manually; focus is otherwise invisible against
   the glass chips without an explicit ring). */
.note-suggestions button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 9999px;
}
.ns-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex: none;
  max-width: 14rem;
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
  background: var(--color-glass-active, color-mix(in oklab, var(--paragraph) 14%, transparent));
  color: var(--color-text, var(--paragraph));
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
}
.ns-chip:hover {
  background: var(--color-glass-hover, color-mix(in oklab, var(--paragraph) 9%, transparent));
  border-color: var(--color-glass-border, color-mix(in oklab, var(--paragraph) 12%, transparent));
}
.ns-chip:active {
  transform: scale(0.97);
}
/* Related-note chip: a pill holding an Open action (title) + a Link action. */
.ns-note {
  display: inline-flex;
  align-items: center;
  flex: none;
  max-width: 16rem;
  border-radius: 9999px;
  background: var(--color-glass-active, color-mix(in oklab, var(--paragraph) 14%, transparent));
  border: 1px solid transparent;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.ns-note:hover {
  background: var(--color-glass-hover, color-mix(in oklab, var(--paragraph) 9%, transparent));
  border-color: var(--color-glass-border, color-mix(in oklab, var(--paragraph) 12%, transparent));
}
.ns-note-open {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.25rem 0 0.25rem 0.6rem;
  color: var(--color-text, var(--paragraph));
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  border: none;
  background: transparent;
}
.ns-note-open > span {
  min-width: 0;
}
.ns-note-link {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 0.25rem 0.5rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  cursor: pointer;
  border: none;
  background: transparent;
  transition: color 0.12s ease;
}
.ns-note-link:hover {
  color: var(--color-text, var(--paragraph));
}
.ns-divider {
  flex: none;
  width: 1px;
  align-self: stretch;
  margin: 0.15rem 0.25rem;
  background: var(--color-glass-border, color-mix(in oklab, var(--paragraph) 12%, transparent));
}
/* Canonical color swatch (copied from ContextMenu.vue .context-menu__swatch). */
.ns-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--paragraph) 25%, transparent);
  vertical-align: middle;
  flex: none;
}
.ns-dismiss {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem;
  border-radius: 8px;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  cursor: pointer;
  border: none;
  background: transparent;
  transition: color 0.12s ease, background 0.12s ease;
}
.ns-dismiss:hover {
  color: var(--color-text, var(--paragraph));
  background: var(--color-glass-hover, color-mix(in oklab, var(--paragraph) 9%, transparent));
}

/* Fade in from the top; fade up + out on leave. Easing matches the right-sidebar
   transition (Material standard) so the motion feels consistent with the rest
   of the app's chrome. */
.ns-fade-down-enter-active {
  transition: opacity 200ms ease, transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
}
.ns-fade-down-leave-active {
  transition: opacity 160ms ease, transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}
.ns-fade-down-enter-from,
.ns-fade-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
@media (prefers-reduced-motion: reduce) {
  .ns-fade-down-enter-active,
  .ns-fade-down-leave-active {
    transition: opacity 0.12s ease;
    transform: none;
  }
  .ns-fade-down-enter-from,
  .ns-fade-down-leave-to {
    transform: none;
  }
}
</style>