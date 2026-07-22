/**
 * @notesnook-vue/ui-vue — Vue 3 + Tailwind v4 UI primitives.
 *
 * Replaces the upstream Theme-UI `Flex`/`Box`/`Text`/`Button`/`Input` stack
 * (`sx` object prop → Emotion) with Tailwind-class-shaped props + a merged
 * `class` passthrough. Colors use the token utilities emitted by
 * `@notesnook-vue/theme-vue`'s `@theme inline` bridge + `injectTheme`
 * (`bg-surface`, `text-text`, `text-text-muted`, `text-heading`, `border-
 * border`, `bg-accent`, `text-accent`, `bg-hover`, `text-placeholder`,
 * `text-icon`, `bg-backdrop`); glassmorphism reads the theme CSS vars
 * (`--backdrop-blur-base`, `--nn-surface-opacity`, `--background`) directly.
 *
 * Class merging uses `tailwind-merge` so caller classes override primitive
 * defaults cleanly (see `utils/merge.ts`).
 *
 * Import from `@notesnook-vue/ui-vue`. Primitives are source-as-entry SFCs
 * (no build step); `vue-tsc` type-checks them via `apps/desktop/tsconfig.web.json`'s
 * widened `include`.
 */
export { default as Box } from "./components/Box.vue";
export { default as Flex } from "./components/Flex.vue";
export { default as Text } from "./components/Text.vue";
export { default as Button } from "./components/Button.vue";
export { default as Input } from "./components/Input.vue";
export { default as Icon } from "./components/Icon.vue";
export { ICONS, getIcon, loadAllIcons, allIconNames, fullIcons } from "./components/icon-registry";
export type { IconName } from "./components/icon-registry";
export { default as Surface } from "./components/Surface.vue";

export { cx } from "./utils/merge";
export type { ClassValue } from "./utils/merge";
export { glassStyle } from "./utils/glass";
export type {
  ButtonVariant,
  InputVariant,
  Size,
  TextSize,
  TextVariant,
  FontWeight,
  Direction,
  Align,
  Justify,
  Gap
} from "./types";