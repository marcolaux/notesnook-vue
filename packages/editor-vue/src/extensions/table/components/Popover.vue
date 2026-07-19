<!--
  Part of the Notesnook Vue port (packages/editor-vue). Minimal popover:
  teleported to <body>, fixed-positioned at the anchor button, closes on
  outside-mousedown and Escape. Replaces @notesnook/ui's getPosition +
  ResponsivePresenter for the table properties menus (Phase 2.5 will build a
  shared popover primitive).
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ anchor: HTMLElement | null }>();
const emit = defineEmits<{ close: [] }>();

const el = ref<HTMLElement | null>(null);

function position() {
  if (!el.value || !props.anchor) return;
  const r = props.anchor.getBoundingClientRect();
  const top = Math.min(r.bottom + 2, window.innerHeight - 220);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - 248));
  el.value.style.top = `${top}px`;
  el.value.style.left = `${left}px`;
}

function onDown(e: MouseEvent) {
  const t = e.target as Node | null;
  if (
    el.value &&
    !el.value.contains(t) &&
    props.anchor &&
    !props.anchor.contains(t)
  ) {
    emit("close");
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("keydown", onKey);
  position();
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDown, true);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="table-popover" contenteditable="false" @mousedown.stop>
      <slot />
    </div>
  </Teleport>
</template>