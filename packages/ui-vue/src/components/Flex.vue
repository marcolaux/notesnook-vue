<script setup lang="ts">
/**
 * Flex — row/column flex layout. Maps `direction`/`align`/`justify`/`wrap`/
 * `gap` props to Tailwind flex utilities; `inline` selects `inline-flex`.
 * `glass` applies the theme glassmorphism recipe (see `utils/glass.ts`).
 */
import { computed, type CSSProperties } from "vue";
import { cx } from "../utils/merge";
import { glassStyle } from "../utils/glass";
import { usePrimitiveAttrs } from "../utils/use-primitive";
import type { Direction, Align, Justify, Gap } from "../types";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    as?: string;
    glass?: boolean;
    inline?: boolean;
    direction?: Direction;
    align?: Align;
    justify?: Justify;
    wrap?: boolean;
    gap?: Gap;
  }>(),
  { as: "div", glass: false, inline: false, direction: "row", wrap: false }
);

const { callerClass, rest } = usePrimitiveAttrs();

const directionClass: Record<Direction, string> = {
  row: "flex-row",
  "row-reverse": "flex-row-reverse",
  column: "flex-col",
  "column-reverse": "flex-col-reverse"
};
const alignClass: Record<Align, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline"
};
const justifyClass: Record<Justify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly"
};

const classes = computed(() =>
  cx(
    props.inline ? "inline-flex" : "flex",
    directionClass[props.direction],
    props.align ? alignClass[props.align] : "",
    props.justify ? justifyClass[props.justify] : "",
    props.wrap ? "flex-wrap" : "",
    props.gap != null ? `gap-${props.gap}` : "",
    callerClass.value
  )
);
const style = computed<CSSProperties | undefined>(() =>
  props.glass ? glassStyle({ blur: true, opacity: true }) : undefined
);
</script>

<template>
  <component :is="as" :class="classes" :style="style" v-bind="rest"><slot /></component>
</template>