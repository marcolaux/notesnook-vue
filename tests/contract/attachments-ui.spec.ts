// @vitest-environment node
/**
 * Pure helpers for the Attachments section — no db, no DOM. Covers
 * `formatBytes`, `ATTACHMENT_FILTERS` config, and `mimeCategory` routing.
 * The db-backed store is tested in `attachments-store.spec.ts` (fake db) and
 * `attachments-real-db.spec.ts` (real encrypted round-trip).
 */
import { describe, it, expect } from "vitest";
import {
  formatBytes,
  mimeCategory,
  ATTACHMENT_FILTERS,
  type AttachmentFilter
} from "@/utils/attachments";

describe("formatBytes", () => {
  it("formats 0 / negative / undefined as '0 B'", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(undefined)).toBe("0 B");
    expect(formatBytes(null)).toBe("0 B");
  });

  it("keeps bytes whole and rounds KB+ to one decimal under 10", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
  });

  it("rounds to a whole number once the value is >= 10 of the unit", () => {
    expect(formatBytes(10240)).toBe("10 KB");
    expect(formatBytes(12345678)).toBe("12 MB"); // 11.77 MB → rounds to 12
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });
});

describe("ATTACHMENT_FILTERS", () => {
  it("has the six core-backed filters in order", () => {
    expect(ATTACHMENT_FILTERS.map((f) => f.id)).toEqual([
      "all",
      "images",
      "videos",
      "audios",
      "documents",
      "orphaned"
    ] as AttachmentFilter[]);
  });

  it("each filter resolves a selector from the matching db.attachments getter", () => {
    const allSelector = { items: async () => [], count: async () => 0, ids: async () => [] };
    const imagesSelector = { items: async () => [], count: async () => 0, ids: async () => [] };
    const orphanedSelector = { items: async () => [], count: async () => 0, ids: async () => [] };
    const db = {
      attachments: {
        all: allSelector,
        images: imagesSelector,
        videos: { items: async () => [], count: async () => 0, ids: async () => [] },
        audios: { items: async () => [], count: async () => 0, ids: async () => [] },
        documents: { items: async () => [], count: async () => 0, ids: async () => [] },
        orphaned: orphanedSelector
      }
    } as unknown as import("@notesnook-vue/contracts").Database;
    expect(ATTACHMENT_FILTERS.find((f) => f.id === "all")!.selector(db)).toBe(allSelector);
    expect(ATTACHMENT_FILTERS.find((f) => f.id === "images")!.selector(db)).toBe(imagesSelector);
    expect(ATTACHMENT_FILTERS.find((f) => f.id === "orphaned")!.selector(db)).toBe(orphanedSelector);
  });
});

describe("mimeCategory", () => {
  it("routes by mime prefix", () => {
    expect(mimeCategory("image/png")).toBe("image");
    expect(mimeCategory("image/jpeg")).toBe("image");
    expect(mimeCategory("video/mp4")).toBe("video");
    expect(mimeCategory("audio/mpeg")).toBe("audio");
  });

  it("routes known document mimetypes to 'document'", () => {
    expect(mimeCategory("application/pdf")).toBe("document");
    expect(mimeCategory("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
      "document"
    );
    expect(mimeCategory("text/plain")).toBe("document");
    expect(mimeCategory("text/csv")).toBe("document");
  });

  it("falls back to 'file' for unknown / empty / null", () => {
    expect(mimeCategory("application/octet-stream")).toBe("file");
    expect(mimeCategory("")).toBe("file");
    expect(mimeCategory(undefined)).toBe("file");
    expect(mimeCategory(null)).toBe("file");
  });

  it("is case-insensitive", () => {
    expect(mimeCategory("IMAGE/PNG")).toBe("image");
    expect(mimeCategory("Application/PDF")).toBe("document");
  });
});