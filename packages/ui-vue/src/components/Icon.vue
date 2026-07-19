<script setup lang="ts">
/**
 * Icon — MDI path wrapper. `path` is the SVG `d` attribute (Material Design
 * Icons use a `0 0 24 24` viewBox and `fill="currentColor"`). Color inherits
 * from the parent's `text-*` class via `currentColor`, so `<Button iconOnly>
 * <Icon :path="mdiPlus"/></Button>` matches the button text color. `spin`
 * adds `animate-spin` (e.g. a loading spinner). A `title` makes the icon
 * accessible (`role="img"` + `<title>`); without one the icon is `aria-hidden`.
 */
import { computed } from "vue";
import { cx } from "../utils/merge";
import { usePrimitiveAttrs } from "../utils/use-primitive";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{ path: string; size?: number | string; title?: string; spin?: boolean }>(),
  { size: 18, spin: false }
);

const { callerClass, rest } = usePrimitiveAttrs();

const dim = computed(() => (typeof props.size === "number" ? `${props.size}` : props.size));
const classes = computed(() => cx("inline-block shrink-0", props.spin ? "animate-spin" : "", callerClass.value));
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="dim"
    :height="dim"
    fill="currentColor"
    :role="title ? 'img' : undefined"
    :aria-hidden="title ? undefined : 'true'"
    :class="classes"
    v-bind="rest"
  >
    <title v-if="title">{{ title }}</title>
    <path :d="path" />
  </svg>
</template>