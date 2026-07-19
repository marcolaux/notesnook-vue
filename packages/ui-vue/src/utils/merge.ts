/**
 * Class composition helper backed by `tailwind-merge`.
 *
 * Primitives compute a base class string from their props, then merge the
 * caller's `class` attr on top with `cx` so conflicting Tailwind utilities
 * resolve cleanly (caller's `px-6` overrides the primitive's `px-3`, etc.).
 * `twMerge` dedupes conflicts in Tailwind's idiom; plain concatenation would
 * leave both utilities present and rely on fragile CSS source order.
 */
import { twMerge } from "tailwind-merge";

export type ClassValue = string | false | null | undefined;

export function cx(...parts: ClassValue[]): string {
  return twMerge(parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" "));
}