<script setup lang="ts">
/**
 * Icon — unified monochromatic icon (Lucide stroke set).
 *
 * `name` is a key into the curated registry in `./icon-registry.ts` (which maps
 * kebab-case names to `@lucide/vue` components). Color inherits from the parent's
 * `text-*` class via `currentColor` (Lucide's default `stroke`). `fill` defaults
 * to `"none"` (outline look) — pass `fill="currentColor"` for filled active
 * states (★ on, 📌 pinned, active toolbar toggles). `spin` adds `animate-spin`
 * (e.g. a loading spinner). A `title` makes the icon accessible (`role="img"`
 * + `<title>`); without one the icon is `aria-hidden`. Unknown names render
 * nothing, so stale glyph strings fail safe rather than leaking emoji.
 *
 * Replaces the former MDI single-`path` wrapper (which was never imported).
 */
import { computed } from "vue";
import { cx } from "../utils/merge";
import { usePrimitiveAttrs } from "../utils/use-primitive";
import { getIcon } from "./icon-registry";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number | string;
    fill?: string;
    strokeWidth?: number;
    title?: string;
    spin?: boolean;
  }>(),
  { size: 16, fill: "none", strokeWidth: 2, spin: false }
);

const { callerClass, rest } = usePrimitiveAttrs();

const comp = computed(() => getIcon(props.name));
const classes = computed(() =>
  cx("inline-block shrink-0", props.spin ? "animate-spin" : "", callerClass.value)
);
</script>

<template>
  <component
    v-if="comp"
    :is="comp"
    :size="size"
    :stroke-width="strokeWidth"
    :fill="fill"
    :role="title ? 'img' : undefined"
    :aria-hidden="title ? undefined : 'true'"
    :class="classes"
    v-bind="rest"
  >
    <title v-if="title">{{ title }}</title>
  </component>
</template>