<script setup lang="ts">
/**
 * Surface — `Box` + theme-driven glassmorphism baked in. Shortcut for the
 * recurring `backdrop-blur-*` + translucent-surface pattern, but driven by
 * the theme glassmorphism vars instead of white-alpha literals. `blur` and
 * `opacity` default `true` and can be turned off independently.
 */
import { computed, type CSSProperties } from "vue";
import { cx } from "../utils/merge";
import { glassStyle } from "../utils/glass";
import { usePrimitiveAttrs } from "../utils/use-primitive";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{ as?: string; blur?: boolean; opacity?: boolean }>(),
  { as: "div", blur: true, opacity: true }
);

const { callerClass, rest } = usePrimitiveAttrs();

const classes = computed(() => cx("box-border", callerClass.value));
const style = computed<CSSProperties | undefined>(() =>
  glassStyle({ blur: props.blur, opacity: props.opacity })
);
</script>

<template>
  <component :is="as" :class="classes" :style="style" v-bind="rest"><slot /></component>
</template>