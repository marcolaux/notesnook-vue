// @vitest-environment happy-dom
/**
 * Attachments bridge — file-handling, mime-routing, and toolbar action.
 *
 * The encrypted round-trip (db.attachments.save/read + the local-user master
 * key) is covered in `local-user-attachments.spec.ts` against a real db. Here
 * the bridge's *file* path is exercised with a fake db (mocked `getDatabase`),
 * so `File`/`FileReader`/`Image`/`DataTransfer` (happy-dom) are the only runtime
 * deps. Together the two files cover the full drop → read → save → insert
 * chain deterministically; the live DOM drop/paste event → editor view dispatch
 * is the on-site visual gate.
 */
import { describe, it, expect, vi } from "vitest";
import { EDITOR_ACTIONS } from "@notesnook-vue/editor-vue";
import type { Database } from "@notesnook-vue/contracts";

// Mock `@/platform/bootstrap`'s `getDatabase` so the bridge reaches a fake db.
const dbRef = vi.hoisted(() => {
  let db: Database | undefined;
  return {
    getDatabase: () => db,
    setDatabase: (d: Database) => {
      db = d;
    }
  };
});
vi.mock("@/platform/bootstrap", () => ({ getDatabase: dbRef.getDatabase }));

// Mock the layout store so the `openAttachmentPreview` hook (which lazy-imports
// it) can be asserted without pulling Pinia + the real store into this test.
const layoutMock = vi.hoisted(() => {
  const openAttachmentSplit = vi.fn();
  return { openAttachmentSplit, useEditorLayoutStore: () => ({ openAttachmentSplit }) };
});
vi.mock("@/stores/editor-layout", () => ({
  useEditorLayoutStore: layoutMock.useEditorLayoutStore
}));

const {
  parseDataUrl,
  readFileAsDataUrl,
  ingestFile,
  dropFilesFrom,
  wireAttachmentStorage
} = await import("@/editor/attachments-bridge");

/** A fake db whose `attachments.save` returns a deterministic hash by mime. */
function fakeDb(): Database {
  return {
    attachments: {
      save: async (data: string, mime: string) => `hash-${mime.replace("/", "-")}`,
      read: async (hash: string) => `data:image/png;base64,${hash}`
    }
  } as unknown as Database;
}

describe("attachments-bridge: parseDataUrl", () => {
  it("splits a base64 data URL into mime + base64", () => {
    const out = parseDataUrl("data:image/png;base64,aGVsbG8=");
    expect(out).toEqual({ mime: "image/png", base64: "aGVsbG8=" });
  });
  it("defaults the mime when the data URL omits it", () => {
    const out = parseDataUrl("data:;base64,aGVsbG8=");
    expect(out).toEqual({ mime: "application/octet-stream", base64: "aGVsbG8=" });
  });
  it("returns null for a non-data-url string", () => {
    expect(parseDataUrl("https://example.com/x.png")).toBeNull();
    expect(parseDataUrl("not a url")).toBeNull();
  });
});

describe("attachments-bridge: readFileAsDataUrl", () => {
  it("reads a File as a data URL", async () => {
    const file = new File(["hello world"], "hello.txt", { type: "text/plain" });
    const dataUrl = await readFileAsDataUrl(file);
    expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
  });
});

describe("attachments-bridge: ingestFile (mime routing)", () => {
  it("routes an image file to an image node (aspect-ratio metadata, no px size)", async () => {
    dbRef.setDatabase(fakeDb());
    const file = new File([new Uint8Array([1, 2, 3, 4])], "pic.png", {
      type: "image/png"
    });
    const ingested = await ingestFile(file, {
      readDimensions: async () => ({ width: 200, height: 100, aspectRatio: 2 })
    });
    expect(ingested?.kind).toBe("image");
    if (ingested?.kind === "image") {
      expect(ingested.attrs.hash).toBe("hash-image-png");
      expect(ingested.attrs.filename).toBe("pic.png");
      expect(ingested.attrs.mime).toBe("image/png");
      // width/height are NOT set from the natural size (the node renders at
      // 100% width with intrinsic aspect when they are unset); only the
      // aspect-ratio metadata is carried for the resize-handle math.
      expect(ingested.attrs.width).toBeUndefined();
      expect(ingested.attrs.height).toBeUndefined();
      expect(ingested.attrs.aspectRatio).toBe(2);
    }
  });

  it("routes a non-image file to an attachment chip", async () => {
    dbRef.setDatabase(fakeDb());
    const file = new File([new Uint8Array([1, 2, 3, 4])], "doc.pdf", {
      type: "application/pdf"
    });
    const ingested = await ingestFile(file, {
      readDimensions: async () => null
    });
    expect(ingested?.kind).toBe("file");
    if (ingested?.kind === "file") {
      expect(ingested.attrs.hash).toBe("hash-application-pdf");
      expect(ingested.attrs.filename).toBe("doc.pdf");
      expect(ingested.attrs.mime).toBe("application/pdf");
    }
  });

  it("image attrs omit aspectRatio when dimensions are unavailable", async () => {
    dbRef.setDatabase(fakeDb());
    const file = new File([new Uint8Array([1])], "x.jpg", { type: "image/jpeg" });
    const ingested = await ingestFile(file, { readDimensions: async () => null });
    expect(ingested?.kind).toBe("image");
    if (ingested?.kind === "image") {
      expect(ingested.attrs.width).toBeUndefined();
      expect(ingested.attrs.height).toBeUndefined();
      expect(ingested.attrs.aspectRatio).toBeUndefined();
    }
  });
});

describe("attachments-bridge: dropFilesFrom", () => {
  it("prefers dt.files when present (drop case)", () => {
    const a = new File(["a"], "a.png", { type: "image/png" });
    const dt = { files: [a], items: [] } as unknown as DataTransfer;
    expect(dropFilesFrom(dt).map((f) => f.name)).toEqual(["a.png"]);
  });

  it("falls back to dt.items when files is empty (paste / screenshot case)", () => {
    const file = new File(["shot"], "screenshot.png", { type: "image/png" });
    const dt = {
      files: [],
      items: [{ kind: "file", getAsFile: () => file }]
    } as unknown as DataTransfer;
    expect(dropFilesFrom(dt).map((f) => f.name)).toEqual(["screenshot.png"]);
  });

  it("ignores non-file items", () => {
    const dt = {
      files: [],
      items: [{ kind: "string", getAsFile: () => null }]
    } as unknown as DataTransfer;
    expect(dropFilesFrom(dt)).toEqual([]);
  });

  it("returns [] for null/undefined", () => {
    expect(dropFilesFrom(null)).toEqual([]);
    expect(dropFilesFrom(undefined)).toEqual([]);
  });
});

describe("tool-definitions: image action opens the attachment picker", () => {
  it("image run calls editor.storage.openAttachmentPicker('image')", () => {
    const calls: string[] = [];
    const editor = {
      storage: { openAttachmentPicker: (type: string) => calls.push(type) },
      isEditable: true
    } as unknown as import("@tiptap/vue-3").Editor;
    const image = EDITOR_ACTIONS.find((a) => a.id === "image")!;
    image.run(editor);
    expect(calls).toEqual(["image"]);
  });

  it("image run is a no-op when the picker is not wired", () => {
    const editor = { storage: {}, isEditable: true } as unknown as import("@tiptap/vue-3").Editor;
    const image = EDITOR_ACTIONS.find((a) => a.id === "image")!;
    expect(() => image.run(editor)).not.toThrow();
  });
});

describe("attachments-bridge: wireAttachmentStorage openAttachmentPreview hook", () => {
  /** Flush the hook's lazy dynamic import + call. */
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function fakeEditor(isDestroyed = false): {
    storage: Record<string, unknown>;
    isDestroyed: boolean;
  } {
    return { storage: {}, isDestroyed };
  }

  it("installs openAttachmentPreview on editor.storage", () => {
    const editor = fakeEditor();
    wireAttachmentStorage(editor, () => "group-1");
    expect(typeof editor.storage.openAttachmentPreview).toBe("function");
  });

  it("double-click hook calls openAttachmentSplit(groupId, attrs, 'right')", async () => {
    const editor = fakeEditor();
    wireAttachmentStorage(editor, () => "group-1");
    layoutMock.openAttachmentSplit.mockClear();
    const hook = editor.storage.openAttachmentPreview as (a: unknown) => void;
    hook({ hash: "h1", filename: "doc.pdf", mime: "application/pdf", size: 10 });
    await flush();
    expect(layoutMock.openAttachmentSplit).toHaveBeenCalledWith(
      "group-1",
      { hash: "h1", filename: "doc.pdf", mime: "application/pdf", size: 10 },
      "right"
    );
  });

  it("is a no-op when getGroupId returns undefined (no pane)", async () => {
    const editor = fakeEditor();
    wireAttachmentStorage(editor, () => undefined);
    layoutMock.openAttachmentSplit.mockClear();
    (editor.storage.openAttachmentPreview as (a: unknown) => void)({
      hash: "h1",
      filename: "x",
      mime: "text/plain",
      size: 1
    });
    await flush();
    expect(layoutMock.openAttachmentSplit).not.toHaveBeenCalled();
  });

  it("is a no-op when the editor is destroyed", async () => {
    const editor = fakeEditor(true);
    wireAttachmentStorage(editor, () => "group-1");
    layoutMock.openAttachmentSplit.mockClear();
    (editor.storage.openAttachmentPreview as (a: unknown) => void)({
      hash: "h1",
      filename: "x",
      mime: "text/plain",
      size: 1
    });
    await flush();
    expect(layoutMock.openAttachmentSplit).not.toHaveBeenCalled();
  });

  it("is a no-op when getGroupId is not provided (legacy 1-arg wiring)", async () => {
    const editor = fakeEditor();
    // No getGroupId arg — the hook must stay inert (no pane to split from).
    wireAttachmentStorage(editor);
    layoutMock.openAttachmentSplit.mockClear();
    (editor.storage.openAttachmentPreview as (a: unknown) => void)({
      hash: "h1",
      filename: "x",
      mime: "text/plain",
      size: 1
    });
    await flush();
    expect(layoutMock.openAttachmentSplit).not.toHaveBeenCalled();
  });
});