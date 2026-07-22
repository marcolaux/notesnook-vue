// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { AttachmentTabAttrs } from "@/stores/editor-layout";

const PDF: AttachmentTabAttrs = {
  hash: "hash-pdf-1",
  filename: "doc.pdf",
  mime: "application/pdf",
  size: 1234
};
const TEXT: AttachmentTabAttrs = {
  hash: "hash-txt-1",
  filename: "notes.txt",
  mime: "text/plain",
  size: 42
};

describe("useEditorLayoutStore — attachment tabs", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("openAttachmentTab creates a kind:attachment tab + attachment session", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    const id = s.openAttachmentTab(gid, PDF);
    expect(id).toBeTruthy();
    const tab = s.tabs[id];
    expect(tab).toBeDefined();
    expect(tab.kind).toBe("attachment");
    expect(tab.attachment).toEqual(PDF);
    expect(tab.groupId).toBe(gid);
    expect(tab.history).toEqual([]);
    // Session registered with type "attachment" + no noteId.
    const session = s.sessions[tab.sessionId];
    expect(session.type).toBe("attachment");
    expect(session.noteId).toBeUndefined();
    expect(session.title).toBe(PDF.filename);
    // Group's active tab is the new attachment tab.
    expect(s.groups[gid].activeTabId).toBe(id);
  });

  it("tabForAttachment reuses by hash across groups (one tab per hash)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    const id1 = s.openAttachmentTab(gid, PDF);
    // Open the same hash again (e.g. dblclick from another note) — reuse.
    const id2 = s.openAttachmentTab(gid, PDF);
    expect(id2).toBe(id1);
    expect(Object.keys(s.tabs).filter((t) => s.tabs[t].kind === "attachment")).toHaveLength(1);
    expect(s.tabForAttachment(PDF.hash)?.id).toBe(id1);
  });

  it("tabForNote does NOT match attachment tabs", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    s.openTab(gid, "note-1");
    s.openAttachmentTab(gid, PDF);
    // A note tab + an attachment tab coexist; tabForNote finds only the note.
    expect(s.tabForNote("note-1")?.kind).toBe("note");
    expect(s.tabForNote("note-1")?.id).not.toBe(s.tabForAttachment(PDF.hash)?.id);
    // tabForAttachment never returns a note tab.
    expect(s.tabForAttachment(PDF.hash)?.kind).toBe("attachment");
  });

  it("note-tab reuse by noteId still works alongside attachment tabs", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    const n1 = s.openTab(gid, "note-1");
    const n2 = s.openTab(gid, "note-1"); // reuse
    expect(n2).toBe(n1);
    s.openAttachmentTab(gid, PDF);
    s.openAttachmentTab(gid, TEXT);
    // 1 note tab + 2 attachment tabs.
    const kinds = Object.values(s.tabs).map((t) => t.kind);
    expect(kinds.filter((k) => k === "note")).toHaveLength(1);
    expect(kinds.filter((k) => k === "attachment")).toHaveLength(2);
  });

  it("openAttachmentSplit with an existing tab focuses it instead of splitting", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    const id1 = s.openAttachmentTab(gid, PDF);
    const before = s.groupCount;
    // Splitting the same hash a second time must reuse, not create a pane.
    const id2 = s.openAttachmentSplit(gid, PDF, "right");
    expect(id2).toBe(id1);
    expect(s.groupCount).toBe(before);
    expect(s.tabs[id1].groupId).toBe(gid);
  });

  it("openAttachmentSplit with no existing tab splits right + opens in the new pane", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    const before = s.groupCount;
    const id = s.openAttachmentSplit(gid, PDF, "right");
    expect(id).toBeTruthy();
    expect(s.groupCount).toBe(before + 1);
    const tab = s.tabs[id];
    expect(tab.kind).toBe("attachment");
    // The new tab lives in a DIFFERENT group (the new right sibling), and that
    // group is now active.
    expect(tab.groupId).not.toBe(gid);
    expect(s.activeGroupId).toBe(tab.groupId);
  });

  it("closeTab drops an attachment tab + its session", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    const id = s.openAttachmentTab(gid, PDF);
    const sessionId = s.tabs[id].sessionId;
    expect(s.sessions[sessionId]).toBeDefined();
    s.closeTab(id);
    expect(s.tabs[id]).toBeUndefined();
    expect(s.sessions[sessionId]).toBeUndefined();
  });

  it("navigateTab is a no-op on attachment tabs", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    const id = s.openAttachmentTab(gid, PDF);
    s.navigateTab(id, "note-99");
    // History stays empty; noteId stays undefined.
    expect(s.tabs[id].history).toEqual([]);
    expect(s.tabs[id].noteId).toBeUndefined();
  });

  it("canGoBack/canGoForward are false for attachment tabs", () => {
    const s = useEditorLayoutStore();
    s.init();
    const gid = s.activeGroupId;
    const id = s.openAttachmentTab(gid, PDF);
    expect(s.canGoBack(id)).toBe(false);
    expect(s.canGoForward(id)).toBe(false);
    expect(s.goBack(id)).toBe(false);
    expect(s.goForward(id)).toBe(false);
  });

  it("openAttachmentTab on a nonexistent group is a no-op (returns empty)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const id = s.openAttachmentTab("no-such-group", PDF);
    expect(id).toBe("");
    expect(s.tabForAttachment(PDF.hash)).toBeUndefined();
  });
});