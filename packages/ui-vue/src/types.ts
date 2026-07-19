/**
 * Shared prop types for `@notesnook-vue/ui-vue` primitives.
 *
 * These mirror the small set of Tailwind-class-shaped options each primitive
 * accepts. Primitives take Tailwind-class-shaped props (`variant`/`size`/
 * `direction`/`gap`) plus a merged `class` passthrough — never an Emotion
 * `sx` object (the renderer is greenfield with zero Theme-UI footprint).
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type InputVariant = "default" | "error";
export type Size = "sm" | "md" | "lg";
export type TextSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type TextVariant = "heading" | "body" | "muted" | "placeholder" | "accent";
export type FontWeight = "normal" | "medium" | "semibold" | "bold";
export type Direction = "row" | "row-reverse" | "column" | "column-reverse";
export type Align = "start" | "center" | "end" | "stretch" | "baseline";
export type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";
export type Gap = 0 | 1 | 2 | 3 | 4 | 6 | 8 | 10 | 12;