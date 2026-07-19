<script setup lang="ts">
/**
 * Text — inline text with theme color + size + weight. Polymorphic via `as`
 * (default `span`). Layout classes come from the caller; this primitive only
 * sets typography tokens (`text-heading`, `text-text`, `text-text-muted`, …).
 */
import { computed } from "vue";
import { cx } from "../utils/merge";
import { usePrimitiveAttrs } from "../utils/use-primitive";
import type { TextVariant, TextSize, FontWeight } from "../types";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    as?: string;
    variant?: TextVariant;
    size?: TextSize;
    weight?: FontWeight;
  }>(),
  { as: "span", variant: "body", size: "md", weight: "normal" }
);

const { callerClass, rest } = usePrimitiveAttrs();

const variantClass: Record<TextVariant, string> = {
  heading: "text-heading",
  body: "text-text",
  muted: "text-text-muted",
  placeholder: "text-placeholder",
  accent: "text-accent"
};
const sizeClass: Record<TextSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl"
};
const weightClass: Record<FontWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold"
};

const classes = computed(() =>
  cx(variantClass[props.variant], sizeClass[props.size], weightClass[props.weight], callerClass.value)
);
</script>

<template>
  <component :is="as" :class="classes" v-bind="rest"><slot /></component>
</template>