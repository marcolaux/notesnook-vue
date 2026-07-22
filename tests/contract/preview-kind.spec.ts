// @vitest-environment node
import { describe, it, expect } from "vitest";
import { pickPreviewKind } from "@/utils/preview-kind";

describe("pickPreviewKind", () => {
  it("classifies pdf", () => {
    expect(pickPreviewKind("application/pdf")).toBe("pdf");
  });

  it("classifies images / video / audio by prefix", () => {
    expect(pickPreviewKind("image/png")).toBe("image");
    expect(pickPreviewKind("image/jpeg")).toBe("image");
    expect(pickPreviewKind("image/svg+xml")).toBe("image");
    expect(pickPreviewKind("video/mp4")).toBe("video");
    expect(pickPreviewKind("video/quicktime")).toBe("video");
    expect(pickPreviewKind("audio/mpeg")).toBe("audio");
    expect(pickPreviewKind("audio/wav")).toBe("audio");
  });

  it("classifies text-ish mimes as text (raw <pre>, no markdown rendering)", () => {
    expect(pickPreviewKind("text/plain")).toBe("text");
    expect(pickPreviewKind("text/markdown")).toBe("text");
    expect(pickPreviewKind("text/html")).toBe("text");
    expect(pickPreviewKind("application/json")).toBe("text");
    expect(pickPreviewKind("application/javascript")).toBe("text");
    expect(pickPreviewKind("application/x-yaml")).toBe("text");
    expect(pickPreviewKind("application/xml")).toBe("text");
  });

  it("falls back to unsupported for binaries it can't render", () => {
    expect(pickPreviewKind("application/zip")).toBe("unsupported");
    expect(pickPreviewKind(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )).toBe("unsupported");
    expect(pickPreviewKind("application/octet-stream")).toBe("unsupported");
    expect(pickPreviewKind("")).toBe("unsupported");
  });
});