/**
 * Shared composable for the primitive `inheritAttrs: false` + `cx` pattern.
 *
 * Every primitive sets `defineOptions({ inheritAttrs: false })` so it owns its
 * root element's `class` (deduped via `tailwind-merge` in `cx`), then re-spreads
 * the *other* fall-through attrs (`id`, `data-*`, `title`, `disabled`, event
 * listeners, `type`, `placeholder`, …) onto the root via `v-bind="rest"`.
 *
 * `callerClass` is the caller's `class` attr coerced to a string (arrays of
 * strings joined); primitives pass it last to `cx` so it wins conflicts.
 */
import { computed, useAttrs, type ComputedRef } from "vue";

export function usePrimitiveAttrs(): {
  callerClass: ComputedRef<string | undefined>;
  rest: ComputedRef<Record<string, unknown>>;
} {
  const attrs = useAttrs();
  const callerClass = computed<string | undefined>(() => {
    const c = attrs.class;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.filter((x): x is string => typeof x === "string").join(" ");
    return undefined;
  });
  const rest = computed<Record<string, unknown>>(() => {
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(attrs)) {
      if (key !== "class") next[key] = attrs[key];
    }
    return next;
  });
  return { callerClass, rest };
}