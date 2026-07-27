/**
 * Session-state contract (pure) — the persisted shape of the editor session:
 * the main window's open tabs + split layout, the torn-off note windows, and
 * each window's bounds. Lives in `contracts/` so it is the single source of
 * truth shared by main (which owns the `userData/session.json` file) and the
 * renderer (which serialises/rehydrates the layout store), and so the pure
 * helpers (`filterLayoutSnapshot`, `sanitizeBounds`) are headless
 * contract-testable.
 *
 * The persisted types mirror — intentionally — the in-memory shapes in
 * `stores/editor-layout.ts` + `utils/editor-layout.ts` (`LayoutNode`,
 * `EditorGroup`, `EditorTab`, `EditorSession`). They are re-declared here
 * (rather than imported) because the contract module must stay free of
 * renderer-only imports (it is type-checked under the main-process
 * `tsconfig.node.json` too) and the IPC payload is its own canonical shape.
 * Keep these structurally compatible with the store; a `hydrate()` assignment
 * is the round-trip.
 *
 * Session state is LOCAL (per-device, per-account). It is NOT synced and must
 * NOT go through `db.settings` (which syncs) — main writes it to a local
 * `userData/session.json` keyed by `ContextId` (see `account-context.ts`).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types (mirror the layout store; see file header)
// ---------------------------------------------------------------------------

export type Direction = "vertical" | "horizontal";

export interface LayoutNode {
  id: string;
  type: "group" | "split";
  direction?: Direction;
  children?: LayoutNode[];
  /** Present on `"group"` leaves — references an `EditorGroup` by id. */
  groupId?: string;
  /** Persisted split ratio (fraction of the parent split). */
  size?: number | string;
}

export interface EditorGroup {
  id: string;
  activeTabId?: string;
}

export type SessionType =
  | "default"
  | "locked"
  | "readonly"
  | "deleted"
  | "conflicted"
  | "diff"
  | "attachment";

export interface AttachmentTabAttrs {
  hash: string;
  filename: string;
  mime: string;
  size: number;
}

export interface EditorSession {
  id: string;
  tabId: string;
  type: SessionType;
  /** Undefined for attachment sessions (no note). */
  noteId?: string;
  title?: string;
}

export interface EditorTab {
  id: string;
  groupId: string;
  /** `"note"` tabs carry `noteId`; `"attachment"` tabs carry `attachment`;
   *  `"search"` tabs (global-search results) carry `searchQuery`. */
  kind: "note" | "attachment" | "search";
  /** Present on note tabs; undefined on attachment/search tabs. */
  noteId?: string;
  /** Present on attachment tabs; undefined on note/search tabs. */
  attachment?: AttachmentTabAttrs;
  /** Present on search tabs; undefined on note/attachment tabs. The query that
   *  produced this results tab (the pane re-fetches via the search store on
   *  restore since the results cache is per-session). */
  searchQuery?: string;
  sessionId: string;
  /** Visited note ids (back/forward stack). Empty for attachment/search tabs. */
  history: string[];
  historyIndex: number;
  pinned?: boolean;
  scrollTop?: number;
}

/** A JSON snapshot of the layout store's five refs. `layout` is `null` for a
 *  fresh/empty session (the caller re-`init()`s). */
export interface LayoutSnapshot {
  layout: LayoutNode | null;
  groups: Record<string, EditorGroup>;
  tabs: Record<string, EditorTab>;
  sessions: Record<string, EditorSession>;
  activeGroupId: string;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  // `| undefined` so the zod-inferred payload (`.optional()` → `boolean | undefined`)
  // round-trips under `exactOptionalPropertyTypes` without a cast. WindowBounds
  // is not used by the layout store, so widening it has no store-side ripple.
  fullscreen?: boolean | undefined;
}

export interface NoteWindowRecord {
  noteId: string;
  bounds: WindowBounds;
}

/**
 * A torn-off *pane* window — a whole editor pane (a group leaf + all its tabs)
 * detached into its own window. Unlike a {@link NoteWindowRecord} (one noteId),
 * a pane window owns a full {@link LayoutSnapshot} (its group + tabs + sessions)
 * so it rehydrates with all its tabs on reopen-next-run. `paneId` is the
 * main-process id passed as `?window=pane&paneId=<id>`; it keys the in-memory
 * snapshot map and the persisted record (one window per paneId).
 */
export interface PaneWindowRecord {
  paneId: string;
  bounds: WindowBounds;
  layout: LayoutSnapshot;
}

/**
 * Per-account session. `mainBounds` is optional — when absent the main window
 * falls back to the `BASE_WINDOW` defaults (fresh install / never sized).
 * `mainWindowOpenTabs` with a `null` layout means "no tabs were open" → the
 * renderer re-`init()`s an empty root pane. `noteWindows` are single-note
 * torn-off windows; `paneWindows` are whole-pane torn-off windows (each with its
 * own layout snapshot).
 */
export interface ContextSession {
  mainBounds?: WindowBounds;
  mainWindowOpenTabs: LayoutSnapshot;
  noteWindows: NoteWindowRecord[];
  paneWindows: PaneWindowRecord[];
}

export interface SessionFile {
  version: 1;
  contexts: Record<string, ContextSession>;
  /** Best-effort hint used by main to size the FIRST window before any
   *  renderer reports its context. The renderer corrects it on first save. */
  lastContext?: string;
  /** Ordered list of contextIds whose main shell window was open at last
   *  quit — main reopens ONE full-shell window per entry on startup (per-window
   *  multi-account restore: each window is pinned to its `ctx` via `?ctx=`).
   *  Absent on older session files → main falls back to the single-window
   *  legacy behaviour (reopen `lastContext` only). `"local"` may appear here. */
  openMainWindows?: string[];
}

// ---------------------------------------------------------------------------
// Zod schemas (IPC boundary validation in `router.ts`)
// ---------------------------------------------------------------------------

export const WindowBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  maximized: z.boolean(),
  fullscreen: z.boolean().optional()
});

export const NoteWindowRecordSchema = z.object({
  noteId: z.string(),
  bounds: WindowBoundsSchema
});

export const AttachmentTabAttrsSchema = z.object({
  hash: z.string(),
  filename: z.string(),
  mime: z.string(),
  size: z.number()
});

export const EditorSessionSchema = z.object({
  id: z.string(),
  tabId: z.string(),
  type: z.enum([
    "default",
    "locked",
    "readonly",
    "deleted",
    "conflicted",
    "diff",
    "attachment"
  ]),
  noteId: z.string().optional(),
  title: z.string().optional()
});

export const EditorTabSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  kind: z.enum(["note", "attachment", "search"]),
  noteId: z.string().optional(),
  attachment: AttachmentTabAttrsSchema.optional(),
  searchQuery: z.string().optional(),
  sessionId: z.string(),
  history: z.array(z.string()),
  historyIndex: z.number(),
  pinned: z.boolean().optional(),
  scrollTop: z.number().optional()
});

export const EditorGroupSchema = z.object({
  id: z.string(),
  activeTabId: z.string().optional()
});

// Recursive (a split's children are layout nodes). `z.lazy` breaks the cycle.
// The annotation resolves the self-reference (z.lazy can't infer its own
// type); the private shape mirrors the hand-written `LayoutNode` but with
// `| undefined` optionals to match zod's `.optional()` inference. The store
// uses the hand-written `LayoutNode` (plain optionals); the two differ only in
// optional-`undefined` markers and round-trip via the `as LayoutSnapshot` cast
// in `router.ts`.
export interface LayoutNodeShape {
  id: string;
  type: "group" | "split";
  direction?: "vertical" | "horizontal" | undefined;
  children?: LayoutNodeShape[] | undefined;
  groupId?: string | undefined;
  size?: number | string | undefined;
}
export const LayoutNodeSchema: z.ZodType<LayoutNodeShape> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(["group", "split"]),
    direction: z.enum(["vertical", "horizontal"]).optional(),
    children: z.array(LayoutNodeSchema).optional(),
    groupId: z.string().optional(),
    size: z.union([z.number(), z.string()]).optional()
  })
);

export const LayoutSnapshotSchema = z.object({
  layout: LayoutNodeSchema.nullable(),
  groups: z.record(z.string(), EditorGroupSchema),
  tabs: z.record(z.string(), EditorTabSchema),
  sessions: z.record(z.string(), EditorSessionSchema),
  activeGroupId: z.string()
});

export const PaneWindowRecordSchema = z.object({
  paneId: z.string(),
  bounds: WindowBoundsSchema,
  layout: LayoutSnapshotSchema
});

export const ContextSessionSchema = z.object({
  mainBounds: WindowBoundsSchema.optional(),
  mainWindowOpenTabs: LayoutSnapshotSchema,
  noteWindows: z.array(NoteWindowRecordSchema),
  paneWindows: z.array(PaneWindowRecordSchema)
});

export const SessionFileSchema = z.object({
  version: z.literal(1),
  contexts: z.record(z.string(), ContextSessionSchema),
  lastContext: z.string().optional(),
  openMainWindows: z.array(z.string()).optional()
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** An empty snapshot (`layout: null`) — hydrate falls back to `init()`. */
export function emptyLayoutSnapshot(): LayoutSnapshot {
  return { layout: null, groups: {}, tabs: {}, sessions: {}, activeGroupId: "" };
}

/** A fresh per-account session: default bounds (omit → main uses BASE_WINDOW),
 *  no tabs, no note/pane windows. */
export function emptyContextSession(): ContextSession {
  return { mainWindowOpenTabs: emptyLayoutSnapshot(), noteWindows: [], paneWindows: [] };
}

/**
 * Normalize a context read from disk so missing arrays (older session files
 * written before `paneWindows` existed) default to empty arrays rather than
 * `undefined`. Pass-through for a well-formed session. Pure + shared so main can
 * use it on every read without re-implementing the defaults.
 */
export function normalizeContextSession(session: ContextSession): ContextSession {
  return {
    ...session,
    noteWindows: session.noteWindows ?? [],
    paneWindows: session.paneWindows ?? []
  };
}

/** Group-leaf `groupId`s in tree (pre-order) order. */
function allGroupIds(node: LayoutNode): string[] {
  const out: string[] = [];
  const walk = (n: LayoutNode): void => {
    if (n.type === "group" && typeof n.groupId === "string") out.push(n.groupId);
    else if (n.type === "split") for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
}

/**
 * Prune group leaves that have zero remaining tabs, collapsing single-child
 * splits (mirrors `removeGroupLeaf` in `utils/editor-layout.ts`). Returns
 * `null` when every group is empty (the caller re-`init()`s — equivalent to an
 * empty root pane).
 */
function pruneEmptyGroups(node: LayoutNode, tabCountByGroup: Record<string, number>): LayoutNode | null {
  if (node.type === "group") {
    return (tabCountByGroup[node.groupId ?? ""] ?? 0) > 0 ? node : null;
  }
  const children = (node.children ?? [])
    .map((c) => pruneEmptyGroups(c, tabCountByGroup))
    .filter((c): c is LayoutNode => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  return { ...node, children };
}

/**
 * Filter a layout snapshot to only tabs whose `noteId` is still valid in the
 * current account's DB (drops trashed / deleted / foreign-account note ids),
 * then collapses any groups left empty and fixes `activeGroupId` /
 * `activeTabId` if they pointed at something now gone.
 *
 * Attachment tabs are kept as-is (attachment-hash validation is out of scope
 * for the first cut; the attachment preview handles a missing hash gracefully).
 *
 * First-cut note-history policy: a tab whose CURRENT `noteId` is invalid is
 * dropped entirely (history-array pruning of mid-stack deleted ids is
 * deferred). Returns an empty snapshot (`layout: null`) when nothing valid
 * remains — hydrate then re-`init()`s.
 */
export function filterLayoutSnapshot(snapshot: LayoutSnapshot, validNoteIds: Iterable<string>): LayoutSnapshot {
  const valid = new Set(validNoteIds);

  // Keep note tabs with a valid current noteId; keep all attachment tabs.
  const tabs: Record<string, EditorTab> = {};
  for (const [id, t] of Object.entries(snapshot.tabs)) {
    if (t.kind === "note") {
      if (t.noteId && valid.has(t.noteId)) tabs[id] = t;
    } else {
      tabs[id] = t;
    }
  }

  // Keep sessions whose tab survived.
  const sessions: Record<string, EditorSession> = {};
  for (const [id, s] of Object.entries(snapshot.sessions)) {
    if (tabs[s.tabId]) sessions[id] = s;
  }

  if (Object.keys(tabs).length === 0 || snapshot.layout === null) {
    return emptyLayoutSnapshot();
  }

  // Count tabs per group so empty groups can be pruned from the tree.
  const tabCountByGroup: Record<string, number> = {};
  for (const t of Object.values(tabs)) {
    tabCountByGroup[t.groupId] = (tabCountByGroup[t.groupId] ?? 0) + 1;
  }

  const pruned = pruneEmptyGroups(snapshot.layout, tabCountByGroup);
  if (pruned === null) return emptyLayoutSnapshot();

  const remaining = allGroupIds(pruned);
  const groups: Record<string, EditorGroup> = {};
  for (const gid of remaining) {
    const g = snapshot.groups[gid];
    if (!g) continue;
    let activeTabId = g.activeTabId;
    if (activeTabId && !tabs[activeTabId]) {
      const first = Object.values(tabs).find((t) => t.groupId === gid);
      activeTabId = first?.id;
    }
    groups[gid] = { id: g.id, ...(activeTabId ? { activeTabId } : {}) };
  }

  let activeGroupId = snapshot.activeGroupId;
  if (!activeGroupId || !groups[activeGroupId]) activeGroupId = remaining[0] ?? "";

  return { layout: pruned, groups, tabs, sessions, activeGroupId };
}

/**
 * Compute the ordered list of contexts whose main shell window to reopen at
 * startup. Pure over the session file + the set of still-valid context ids
 * (`"local"` is always valid; an account context is valid while its registry
 * entry exists — a removed account's window is dropped so a dead context is
 * never restored). Returns `openMainWindows` with `lastContext` moved to the
 * front (it receives the primary wiring: tray, updater, deep-link), filtered to
 * valid contexts. Falls back to `[lastContext]` (or `[]`) when no
 * `openMainWindows` was recorded (legacy single-window session file). Pure +
 * shared so main can use it without re-implementing the ordering, and it is
 * headless contract-testable.
 */
export function orderOpenMainWindows(
  file: SessionFile,
  validContexts: Iterable<string>
): string[] {
  const valid = new Set(validContexts);
  const list = file.openMainWindows ?? [];
  const last = file.lastContext;
  if (list.length === 0) {
    // Legacy / fresh install: reopen only the last-used context (if still
    // valid). An empty file with no lastContext → `[]` (main creates a default
    // main window instead of restoring nothing).
    return last && valid.has(last) ? [last] : [];
  }
  const filtered = list.filter((c) => valid.has(c));
  if (last && filtered.includes(last)) {
    return [last, ...filtered.filter((c) => c !== last)];
  }
  return filtered;
}

/**
 * Validate / clamp persisted bounds. Returns `undefined` when the bounds are
 * unusable (non-finite, or below the min usable size) so the caller falls back
 * to the default window size. `x`/`y` default to 0 when non-finite (the OS will
 * reposition the window on screen). A maximized window's bounds are kept as-is
 * (the caller re-applies `maximize()` rather than trusting the saved size).
 */
export function sanitizeBounds(
  bounds: WindowBounds | undefined,
  min: { width: number; height: number } = { width: 480, height: 320 }
): WindowBounds | undefined {
  if (!bounds) return undefined;
  const { x, y, width, height, maximized, fullscreen } = bounds;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < min.width ||
    height < min.height
  ) {
    return undefined;
  }
  return {
    x: Number.isFinite(x) ? Math.round(x) : 0,
    y: Number.isFinite(y) ? Math.round(y) : 0,
    width: Math.round(width),
    height: Math.round(height),
    maximized: !!maximized,
    ...(fullscreen ? { fullscreen: true } : {})
  };
}