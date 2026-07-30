/*
Attachments bridge — wires the TipTap editor to `@notesnook/core`'s
`db.attachments` so dropped / pasted / picked files are stored as encrypted
per-account attachments and inserted into the note (image node for `image/*`,
attachment chip otherwise), and so hash-only image nodes lazy-load their blob.

The pure editor package (`packages/editor-vue`) stays free of any `db`/core
dependency; this renderer-only module owns the orchestration:
  - `createImageDropPasteProps()` → `editorProps.handleDrop`/`handlePaste` for
    `useEditor`, capturing OS file drops + clipboard pastes.
  - `wireAttachmentStorage(editor)` → sets `editor.storage.getAttachmentData`
    (so `ImageComponent` lazy-loads hash-only images) + `openAttachmentPicker`
    (so the toolbar 🖼 button / slash "Image" item open a file picker).
  - `ingestFile(file)` → reads bytes → `db.attachments.save` → returns the node
    attrs (image or chip), routing by mime.

Requires a user master key (per-account after login, or the synthesised local
user in local mode — see `platform/local-user.ts`). `ingestFile` returns `null`
on any failure so a single bad file never aborts the rest of a multi-file drop.
*/
import type { Editor } from "@tiptap/vue-3";
import type { EditorProps, EditorView } from "@tiptap/pm/view";
import type { Slice } from "@tiptap/pm/model";
import type { ImageAttributes, FileAttachment } from "@notesnook-vue/editor-vue";
import { EVENTS } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import { handleDeepLinkPaste } from "./deep-link-paste";

/** Mime-routed result of ingesting one file. */
export type IngestedFile =
  | { kind: "image"; attrs: ImageAttributes }
  | { kind: "file"; attrs: FileAttachment };

/** Split a `data:<mime>;base64,<...>` URL into its mime + raw base64. */
export function parseDataUrl(
  dataUrl: string
): { mime: string; base64: string } | null {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  return { mime, base64: match[2] ?? "" };
}

/** Read a `File` as a data URL via `FileReader.readAsDataURL`. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

/** Best-effort natural dimensions + aspect ratio for an image data URL. */
export function readImageDimensions(
  dataUrl: string
): Promise<{ width: number; height: number; aspectRatio: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = img;
      if (!width || !height) {
        resolve(null);
        return;
      }
      resolve({ width, height, aspectRatio: width / height });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Read a file, store it as an encrypted attachment via `db.attachments.save`,
 * and return the node attrs (image node for `image/*`, attachment chip
 * otherwise). `readDimensions` is injected so tests don't depend on `Image`
 * decoding; production omits it (uses {@link readImageDimensions}). Returns
 * `null` on any failure so a bad file is skipped, not fatal.
 */
export async function ingestFile(
  file: File,
  options: {
    readDimensions?: (
      dataUrl: string
    ) => Promise<{ width: number; height: number; aspectRatio: number } | null>;
  } = {}
): Promise<IngestedFile | null> {
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;
    const db = getDatabase();
    const hash = await db.attachments.save(parsed.base64, parsed.mime, file.name);
    if (!hash) return null;
    const size = file.size;
    if (parsed.mime.startsWith("image/")) {
      const dims = await (options.readDimensions ?? readImageDimensions)(dataUrl);
      // Do NOT set `width`/`height` to the natural pixel size: the Resizer
      // applies them as the rendered box size (`{width}px {height}px`) and
      // `max-width: 100%` clamps only the width, so a large natural size
      // (e.g. 4000×3000) renders as editor-width × 3000px — wrong aspect.
      // With width/height unset, the node renders at 100% editor width and the
      // <img> height resolves to the intrinsic aspect (correct). width/height
      // are a *display* size committed on resize, not the natural size.
      // `aspectRatio` is kept as metadata for the resize-handle math.
      const attrs: ImageAttributes = {
        hash,
        filename: file.name,
        mime: parsed.mime,
        size,
        ...(dims ? { aspectRatio: dims.aspectRatio } : {})
      };
      return { kind: "image", attrs };
    }
    const attrs: FileAttachment = {
      hash,
      filename: file.name,
      mime: parsed.mime,
      size
    };
    return { kind: "file", attrs };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[attachments-bridge] ingestFile failed:", e);
    return null;
  }
}

/**
 * Collect files from a `DataTransfer` (drop or paste). Prefers `dt.files`
 * (reliable for drops); falls back to `dt.items` (`kind === "file"` →
 * `getAsFile()`) so pasted screenshots — which arrive as items, not `files` —
 * are captured. Returns an empty array when there is nothing to handle so the
 * caller can fall through to the editor's default behaviour.
 */
export function dropFilesFrom(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const fromFiles = dt.files ? Array.from(dt.files) : [];
  if (fromFiles.length > 0) return fromFiles;
  if (!dt.items) return [];
  const out: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  return out;
}

/**
 * Ingest a batch of files and insert each into the editor at `pos` (the drop
 * position, or the current selection for paste/picker). Uses
 * `insertContentAt` so block image nodes insert at the explicit position
 * following schema rules (and replace an empty paragraph rather than nesting).
 * The editor selection advances to the end of each inserted node, so
 * sequential inserts preserve order. Guards `editor.isDestroyed` between
 * awaits — a note switch mid-drop must not insert into a stale editor.
 */
export async function insertIngestedAt(
  editor: Editor,
  files: File[],
  pos: number,
  options: {
    readDimensions?: (
      dataUrl: string
    ) => Promise<{ width: number; height: number; aspectRatio: number } | null>;
  } = {}
): Promise<void> {
  let at = pos;
  for (const file of files) {
    if (editor.isDestroyed) return;
    const ingested = await ingestFile(file, options);
    if (!ingested || editor.isDestroyed) continue;
    const nodeJson =
      ingested.kind === "image"
        ? { type: "image", attrs: ingested.attrs }
        : { type: "attachment", attrs: ingested.attrs };
    // Cast to `any`: `insertContentAt`'s `Content` arg is a broad union; the
    // JSON-node form `{ type, attrs }` is accepted at runtime. Mirrors the
    // `chain` cast used in `tool-definitions.ts` for the same decoupling.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.commands.insertContentAt(at, nodeJson as any);
    at = editor.state.selection.from;
  }
}

/**
 * `editorProps` for `useEditor` that capture OS file drops + clipboard pastes,
 * ingest each file, and insert the resulting node at the drop/caret position.
 * `getEditor` returns the current editor (the Editor is keyed by note id and
 * remounts on switch); the handler returns `true` synchronously to suppress the
 * browser default while the async save+insert runs after (standard TipTap
 * pattern). Returns `false` when there are no files so ProseMirror handles the
 * event normally (e.g. dropping text/HTML).
 */
export function createImageDropPasteProps(
  getEditor: () => Editor | undefined
): Partial<EditorProps> {
  return {
    handleDrop: (
      _view: EditorView,
      event: DragEvent,
      _slice: Slice,
      _moved: boolean
    ): boolean => {
      const files = dropFilesFrom(event.dataTransfer);
      if (files.length === 0) return false;
      const editor = getEditor();
      if (!editor) return false;
      event.preventDefault();
      const coords = viewPosAt(_view, event);
      void insertIngestedAt(editor, files, coords);
      return true;
    },
    handlePaste: (
      view: EditorView,
      event: ClipboardEvent,
      _slice: Slice
    ): boolean => {
      const files = dropFilesFrom(event.clipboardData);
      if (files.length > 0) {
        const editor = getEditor();
        if (!editor) return false;
        event.preventDefault();
        void insertIngestedAt(editor, files, view.state.selection.from);
        return true;
      }
      // A pasted `nn://note/<id>` deep link (e.g. from "Copy deep link to
      // block") → insert it as a titled note link instead of literal URL text.
      // Returns false for everything else so ProseMirror's default text/HTML
      // paste runs unchanged.
      const editor = getEditor();
      if (editor && handleDeepLinkPaste(editor, event)) return true;
      return false;
    }
  };
}

/** Drop position from the event coordinates, falling back to the doc end. */
function viewPosAt(view: EditorView, event: DragEvent): number {
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  return coords?.pos ?? view.state.doc.content.size;
}

/**
 * Populate `editor.storage` with the upstream hooks the image/attachment
 * node-views and the toolbar image action expect:
 *  - `getAttachmentData({ hash })` → `db.attachments.read(hash, "base64")` →
 *    the data URL `ImageComponent` turns into a blob URL (unblocks lazy-load of
 *    hash-only images, including dropped/reloaded ones).
 *  - `openAttachmentPicker(type)` → a hidden `<input type="file">` (image-only
 *    accept for `type === "image"`, anything otherwise) → ingest each → insert
 *    at the current selection. Routes by mime (image → image node, else chip).
 *  - `openAttachmentPreview(attrs)` → split the editor's pane right and open the
 *    attachment as a preview tab (double-click on a chip). The layout store is
 *    imported lazily inside the hook so this bridge module's top-level graph
 *    stays free of the layout store (and so the existing contract tests, which
 *    don't wire the hook, are unaffected). `getGroupId` resolves the editor's
 *    pane (its tab → `tab.groupId`); the hook is a no-op when it's undefined.
 */
export function wireAttachmentStorage(
  editor: Editor,
  getGroupId?: () => string | undefined
): void {
  const storage = editor.storage as Record<string, unknown>;
  storage.getAttachmentData = async ({
    hash
  }: {
    hash: string;
    type?: string;
  }): Promise<string | undefined> => {
    try {
      const db = getDatabase();
      const data = await db.attachments.read(hash, "base64");
      if (typeof data !== "string") {
        // Logs on every transient empty return — if this repeats then succeeds,
        // the read was momentarily unavailable (ImageComponent retries cover it).
        // If it repeats forever, the attachment/key/file is genuinely missing.
        // eslint-disable-next-line no-console
        console.warn(
          "[attachments-bridge] getAttachmentData: read returned no data for hash",
          hash
        );
      }
      return typeof data === "string" ? data : undefined;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[attachments-bridge] getAttachmentData failed:", e);
      return undefined;
    }
  };
  // Notify image node-views when a lazily-downloaded blob lands. Core's
  // `Attachments` fires `EVENTS.mediaAttachmentDownloaded` (with
  // `{ hash, src }`) on `db.eventManager` once an attachment queued via
  // `db.attachments.downloadMedia(noteId)` finishes downloading — the
  // node-view's own retry window (8×150ms) can elapse before a network
  // download completes, so without this hook a freshly-synced image stays on
  // the placeholder until a note switch forces a remount. The ImageComponent
  // subscribes on mount and re-runs its blob fetch when its hash matches.
  // Returns core's `{ unsubscribe }` (or `undefined` when the event manager
  // is unavailable, e.g. in tests) so the node-view can clean up on unmount.
  storage.subscribeAttachmentDownloaded = (
    handler: (payload: { hash: string; src?: string }) => void
  ): { unsubscribe: () => void } | undefined => {
    try {
      return getDatabase().eventManager.subscribe(
        EVENTS.mediaAttachmentDownloaded,
        (payload) => {
          handler(payload as { hash: string; src?: string });
        }
      );
    } catch {
      return undefined;
    }
  };
  storage.openAttachmentPicker = (type: string): void => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = type === "image" ? "image/*" : "*/*";
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      if (files.length && !editor.isDestroyed) {
        void insertIngestedAt(editor, files, editor.state.selection.from);
      }
      input.remove();
    });
    document.body.append(input);
    input.click();
  };
  storage.openAttachmentPreview = (attrs: FileAttachment): void => {
    if (editor.isDestroyed) return;
    const groupId = getGroupId?.();
    if (!groupId) return;
    // Lazy import keeps the bridge's top-level graph free of the layout store
    // (the existing contract tests don't mock it and don't call this hook).
    void (async () => {
      const { useEditorLayoutStore } = await import("@/stores/editor-layout");
      useEditorLayoutStore().openAttachmentSplit(
        groupId,
        {
          hash: attrs.hash,
          filename: attrs.filename,
          mime: attrs.mime,
          size: Number(attrs.size) || 0
        },
        "right"
      );
    })();
  };
}