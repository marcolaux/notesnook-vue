<script setup lang="ts">
/**
 * Input — native `<input>` with `v-model` support (`modelValue` +
 * `update:modelValue`), `size`/`block`/`variant` props, and fall-through
 * native attrs (`type` default `text`, `placeholder`, `maxlength`,
 * `autocomplete`, event listeners, …). `variant="error"` borders with the
 * `--red-static` theme color.
 */
import { computed } from "vue";
import { cx } from "../utils/merge";
import { usePrimitiveAttrs } from "../utils/use-primitive";
import type { InputVariant, Size } from "../types";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    size?: Size;
    block?: boolean;
    variant?: InputVariant;
    disabled?: boolean;
    type?: string;
  }>(),
  { size: "md", block: false, variant: "default", disabled: false, type: "text" }
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { callerClass, rest } = usePrimitiveAttrs();

const sizeClass: Record<Size, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-9 px-3 text-sm",
  lg: "h-11 px-4 text-base"
};

const classes = computed(() =>
  cx(
    "rounded-md border bg-surface text-text placeholder:text-placeholder focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
    props.variant === "error" ? "border-[var(--red-static)]" : "border-border",
    sizeClass[props.size],
    props.block ? "w-full" : "",
    callerClass.value
  )
);

function onInput(e: Event): void {
  emit("update:modelValue", (e.target as HTMLInputElement).value);
}
</script>

<template>
  <input :type="type" :value="modelValue" :class="classes" :disabled="disabled" @input="onInput" v-bind="rest" />
</template>