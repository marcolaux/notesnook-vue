// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useNoteFooter } from "@/composables/use-note-footer";
import type { Attachment, Note, Tag } from "@notesnook-vue/contracts";

type RefTarget = { id: string; type: string };
type Rel = { from: RefTarget; to: RefTarget };

const db = {
  _tags: new Map<string, Tag>(),
  _notes: new Map<string, Note>(),
  _attachments: new Map<string, Attachment>(),
  _rels: [] as Rel[],
  relations: {
    to: vi.fn((target: RefTarget, type: string) => ({
      resolve: vi.fn(async () => {
        if (type === "tag") {
          return db._rels
            .filter((r) => r.from.id === target.id && r.from.type === target.type && r.to.type === "tag")
            .map((r) => db._tags.get(r.to.id))
            .filter((t): t is Tag => Boolean(t));
        }
        if (type === "note") {
          // incoming notes: r.to is target, r.from is note
          return db._rels
            .filter((r) => r.to.id === target.id && r.to.type === target.type && r.from.type === "note")
            .map((r) => db._notes.get(r.from.id))
            .filter((n): n is Note => Boolean(n));
        }
        return [];
      })
    })),
    from: vi.fn((source: RefTarget, type: string) => ({
      resolve: vi.fn(async () => {
        if (type === "note") {
          // outgoing notes: r.from is source, r.to is note
          return db._rels
            .filter((r) => r.from.id === source.id && r.from.type === source.type && r.to.type === "note")
            .map((r) => db._notes.get(r.to.id))
            .filter((n): n is Note => Boolean(n));
        }
        if (type === "attachment") {
          return db._rels
            .filter((r) => r.from.id === source.id && r.from.type === source.type && r.to.type === "attachment")
            .map((r) => db._attachments.get(r.to.id))
            .filter((a): a is Attachment => Boolean(a));
        }
        return [];
      })
    }))
  }
};

vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

describe("useNoteFooter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._tags.clear();
    db._notes.clear();
    db._attachments.clear();
    db._rels = [];
    db.relations.to.mockClear();
    db.relations.from.mockClear();
  });

  it("returns empty refs when noteId is null", async () => {
    const noteId = ref<string | null>(null);
    const footer = useNoteFooter(noteId);
    await footer.reload();

    expect(footer.tags.value).toEqual([]);
    expect(footer.outgoing.value).toEqual([]);
    expect(footer.incoming.value).toEqual([]);
    expect(footer.attachments.value).toEqual([]);
  });

  it("loads tags, outgoing/incoming links, and attachments for bound noteId", async () => {
    const noteId = ref<string | null>("n1");
    const tag1 = { id: "t1", title: "Work" } as Tag;
    const note2 = { id: "n2", title: "Target Note" } as Note;
    const note3 = { id: "n3", title: "Source Note" } as Note;
    const att1 = { id: "a1", hash: "hash1", filename: "doc.pdf", mimeType: "application/pdf", size: 1024 } as Attachment;

    db._tags.set("t1", tag1);
    db._notes.set("n2", note2);
    db._notes.set("n3", note3);
    db._attachments.set("a1", att1);

    db._rels.push(
      { from: { id: "n1", type: "note" }, to: { id: "t1", type: "tag" } },
      { from: { id: "n1", type: "note" }, to: { id: "n2", type: "note" } },
      { from: { id: "n3", type: "note" }, to: { id: "n1", type: "note" } },
      { from: { id: "n1", type: "note" }, to: { id: "a1", type: "attachment" } }
    );

    const footer = useNoteFooter(noteId);
    await footer.reload();

    expect(footer.tags.value).toEqual([{ id: "t1", title: "Work" }]);
    expect(footer.outgoing.value).toEqual([{ id: "n2", title: "Target Note" }]);
    expect(footer.incoming.value).toEqual([{ id: "n3", title: "Source Note" }]);
    expect(footer.attachments.value).toEqual([att1]);
  });

  it("reload fetches newly added attachment relations", async () => {
    const noteId = ref<string | null>("n1");
    const att1 = { id: "a1", hash: "h1", filename: "img.png", mimeType: "image/png", size: 2048 } as Attachment;
    db._attachments.set("a1", att1);

    const footer = useNoteFooter(noteId);
    await footer.reload();
    expect(footer.attachments.value).toEqual([]);

    db._rels.push({ from: { id: "n1", type: "note" }, to: { id: "a1", type: "attachment" } });
    await footer.reload();
    expect(footer.attachments.value).toEqual([att1]);
  });
});
