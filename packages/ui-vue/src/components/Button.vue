<script setup lang="ts">
/**
 * Button — native `<button>` with `variant`/`size`/`iconOnly`/`block` props.
 * Colors use theme token utilities (`bg-accent`, `bg-surface`, `border-border`,
 * `bg-hover`, `text-accent-foreground`); `danger` uses the `--red-static`
 * theme color via an arbitrary value (no red token is bridged into a Tailwind
 * utility — a themed `error` variant is future polish). `type` defaults to
 * `button`. A `click` event is declared+forwarded so consumers can listen
 * both via `@click` and `wrapper.emitted("click")`.
 */
import { computed } from "vue";
import { cx } from "../utils/merge";
import { usePrimitiveAttrs } from "../utils/use-primitive";
import type { ButtonVariant, Size } from "../types";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: Size;
    iconOnly?: boolean;
    block?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  { variant: "secondary", size: "md", iconOnly: false, block: false, disabled: false, type: "button" }
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();

const { callerClass, rest } = usePrimitiveAttrs();

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "bg-surface text-text border border-border hover:bg-hover",
  ghost: "text-text hover:bg-hover",
  danger: "bg-[var(--red-static)] text-white hover:opacity-90"
};
const sizeBox: Record<Size, string> = { sm: "h-7", md: "h-9", lg: "h-11" };
const sizeText: Record<Size, string> = { sm: "text-xs", md: "text-sm", lg: "text-base" };
const sizePad: Record<Size, string> = { sm: "px-2", md: "px-3", lg: "px-4" };
const iconBox: Record<Size, string> = { sm: "w-7", md: "w-9", lg: "w-11" };

const classes = computed(() =>
  cx(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed",
    variantClass[props.variant],
    props.iconOnly
      ? cx(iconBox[props.size], "p-0 grid place-items-center")
      : cx(sizeBox[props.size], sizeText[props.size], sizePad[props.size]),
    props.block ? "w-full" : "",
    callerClass.value
  )
);
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled" @click="emit('click', $event)" v-bind="rest">
    <slot />
  </button>
</template>