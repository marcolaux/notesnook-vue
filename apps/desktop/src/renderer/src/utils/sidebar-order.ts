/**
 * Shared sidebar manual-sort helpers — used by the Colors section (synced via
 * `db.settings.setSideBarOrder("colors")`) and the root Notebooks list
 * (local-only, via `localStorage`). Two concerns live here:
 *
 *  - **Manual-order overlay:** `applyManualOrder` reorders a list so items
 *    whose id appears in `order` come first, in that sequence; the rest keep
 *    their input (base-sort) order. An empty `order` is a no-op → the caller's
 *    base sort (title for colors, pinned-first + key/dir for notebooks) wins.
 *    Non-mutating + stable.
 *
 *  - **HTML5 drag-and-drop payload:** a custom MIME type carries
 *    `{ section, id }` so the sidebar owns the drag (the OS won't treat it as a
 *    text/URL drag into other apps). Mirrors `utils/tab-dnd.ts`'s pattern.
 *
 * The same primitives serve both sections so the drop handler can compute the
 * new id sequence from the displayed list and persist it wholesale (matching
 * upstream colors, which stores a full id array per section).
 */

/** Custom drag MIME for a sidebar row (colors / notebooks). */
export const SIDEBAR_MIME = "application/x-notesnook-sidebar";

/** Which sidebar section a dragged row belongs to. */
export type SidebarSection = "colors" | "notebooks" | "shortcuts";

/** Payload carried under {@link SIDEBAR_MIME} during a sidebar drag. */
export interface SidebarDragPayload {
  section: SidebarSection;
  id: string;
}

/** True when the in-flight drag carries a sidebar-row payload. `dataTransfer.
 *  types` is the only way to detect it in `dragover` (the payload isn't
 *  readable until `drop` fires). */
export function isSidebarDrag(e: DragEvent): boolean {
  return e.dataTransfer?.types?.includes(SIDEBAR_MIME) ?? false;
}

/** Read the sidebar payload, or `null` on missing/garbled data. */
export function readSidebarPayload(e: DragEvent): SidebarDragPayload | null {
  try {
    const raw = e.dataTransfer?.getData(SIDEBAR_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SidebarDragPayload>;
    if (parsed.section && parsed.id) {
      return { section: parsed.section, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/** Write the sidebar payload + set `effectAllowed = "move"` (source row). */
export function writeSidebarPayload(e: DragEvent, payload: SidebarDragPayload): void {
  e.dataTransfer?.setData(SIDEBAR_MIME, JSON.stringify(payload));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

/**
 * Apply a manual-order overlay: copy `items`, then reorder so ids listed in
 * `order` come first in `order`'s sequence; unlisted items keep their input
 * relative order (stable). An empty `order` returns a stable copy of `items`
 * unchanged (→ the caller's base sort wins). Unknown ids in `order` (no
 * matching item) are ignored. Non-mutating.
 */
export function applyManualOrder<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[]
): T[] {
  if (order.length === 0) return [...items];
  const index = new Map<string, number>();
  for (let i = 0; i < order.length; i++) index.set(order[i]!, i);
  return [...items].sort((a, b) => {
    const ai = index.get(a.id);
    const bi = index.get(b.id);
    const aHas = ai !== undefined;
    const bHas = bi !== undefined;
    if (aHas && bHas) return (ai as number) - (bi as number);
    if (aHas) return -1;
    if (bHas) return 1;
    return 0; // both unlisted → stable (Array#sort is stable in Node ≥ 11)
  });
}

/**
 * Compute a new id sequence by moving `from` to a position relative to `to`:
 * `before: true` inserts `from` immediately before `to`; `before: false`
 * inserts it immediately after. Non-mutating. No-op (returns a copy of
 * `ids`) when `from`/`to` are missing, equal, or `to` is absent from `ids`.
 * `from` is clamped to its current position (moved, not duplicated) and is
 * appended to the end when `to` is not found.
 */
export function moveIdTo(
  ids: readonly string[],
  from: string,
  to: string,
  before: boolean
): string[] {
  if (!from || !to || from === to) return [...ids];
  const out = ids.filter((id) => id !== from);
  const targetIndex = out.indexOf(to);
  if (targetIndex === -1) return [...out, from];
  const insertAt = before ? targetIndex : targetIndex + 1;
  out.splice(insertAt, 0, from);
  return out;
}