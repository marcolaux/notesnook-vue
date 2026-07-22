<script setup lang="ts">
/**
 * Animated collapsible left panel (sidebar / notes list). Wraps a panel + its
 * drag `Resizer` in an `overflow: hidden` sleeve whose `width` transitions
 * between the persisted panel width (visible) and 0 (hidden), so collapsing /
 * expanding slides + fades fluidly instead of popping via `display: none`.
 *
 * The slotted panel keeps its FULL fixed width inside the sleeve (clipped by
 * `overflow: hidden` when the sleeve narrows), so its internal layout never
 * reflows mid-animation — it just slides out of view. That also keeps any
 * internal virtual scroller / measurements stable while collapsed.
 *
 * Drag-lag guard: the width transition would make Resizer dragging feel laggy
 * (every pointermove would animate over the transition duration), so the
 * Resizer signals drag start/end and we swap `transition: none` in while
 * `resizing` is true. Visibility toggles still animate; width edits from a
 * drag are instant.
 */
import { computed, ref } from "vue";
import Resizer from "@/components/Resizer.vue";

const props = defineProps<{
  /** Whether the panel is expanded (false → slides closed to width 0). */
  visible: boolean;
  /** Persisted panel width (px) — the width the sleeve opens to. */
  width: number;
  min: number;
  max: number;
}>();

const emit = defineEmits<{
  (e: "resize", width: number): void;
}>();

const resizing = ref(false);

/** Sleeve width: full panel width when visible, 0 when hidden. */
const sleeveWidth = computed(() => (props.visible ? props.width : 0));

function onResize(next: number): void {
  emit("resize", next);
}
</script>

<template>
  <div
    class="relative flex h-full shrink-0 overflow-hidden"
    :style="{
      width: sleeveWidth + 'px',
      opacity: visible ? 1 : 0,
      transition: resizing
        ? 'none'
        : 'width 220ms cubic-bezier(0.4, 0, 0.2, 1), opacity 160ms ease'
    }"
  >
    <!-- Fixed-width inner sleeve: the panel never reflows while the outer
         sleeve animates its width around it. -->
    <div class="h-full" :style="{ width: width + 'px' }">
      <slot />
    </div>
    <Resizer
      :width="width"
      :min="min"
      :max="max"
      @resize-start="resizing = true"
      @resize-end="resizing = false"
      @resize="onResize"
    />
  </div>
</template>