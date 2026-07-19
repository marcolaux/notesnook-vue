/**
 * Palette menu logic (Phase 2.5) — pure filtering + keyboard-nav helpers shared
 * with the slash menu (the underlying subsequence matcher + cycle live in
 * editor-vue's `utils/filter`, re-exported here so the palette doesn't
 * reimplement them).
 */
import type { Command } from "./registry";
import { filterByKey, cycleIndex } from "@notesnook-vue/editor-vue";

/** Filter commands by a subsequence query against title + keywords. */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  return filterByKey(commands, query, (c) => [c.title, ...(c.keywords ?? [])]);
}

/** Wrapping index navigation for the palette's active row. */
export function cycleCommandIndex(current: number, length: number, delta: number): number {
  return cycleIndex(current, length, delta);
}