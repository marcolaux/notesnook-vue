<script setup lang="ts">
/**
 * Box — base block primitive. Polymorphic via `as`; `glass` applies the
 * theme-driven glassmorphism recipe (see `utils/glass.ts`). Callers pass
 * layout/color utilities via `class`; `tailwind-merge` dedupes conflicts.
 */
import { computed, type CSSProperties } from "vue";
import { cx } from "../utils/merge";
import { glassStyle } from "../utils/glass";
import { usePrimitiveAttrs } from "../utils/use-primitive";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    as?: string;
    glass?: boolean;
  }>(),
  { as: "div", glass: false }
);

const { callerClass, rest } = usePrimitiveAttrs();

const classes = computed(() => cx("box-border", callerClass.value));
const style = computed<CSSProperties | undefined>(() =>
  props.glass ? glassStyle({ blur: true, opacity: true }) : undefined
);
</script>

<template>
  <component :is="as" :class="classes" :style="style" v-bind="rest"><slot /></component>
</template>