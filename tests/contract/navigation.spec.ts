import { describe, it, expect } from "vitest";
import { isExternalUrl, isDeepLinkUrl } from "../../apps/desktop/src/main/navigation";

describe("navigation helper", () => {
  describe("isDeepLinkUrl", () => {
    it("identifies nn:// deep links", () => {
      expect(isDeepLinkUrl("nn://note/12345")).toBe(true);
      expect(isDeepLinkUrl("nn://notebook/abc")).toBe(true);
    });

    it("identifies notesnook:// deep links", () => {
      expect(isDeepLinkUrl("notesnook://note/12345")).toBe(true);
    });

    it("returns false for standard web URLs and invalid input", () => {
      expect(isDeepLinkUrl("https://example.com")).toBe(false);
      expect(isDeepLinkUrl("http://localhost:5173")).toBe(false);
      expect(isDeepLinkUrl("file:///path/to/file")).toBe(false);
      expect(isDeepLinkUrl("")).toBe(false);
    });
  });

  describe("isExternalUrl", () => {
    it("identifies standard external web URLs", () => {
      expect(isExternalUrl("https://github.com/notesnook/notesnook")).toBe(true);
      expect(isExternalUrl("http://example.com/page")).toBe(true);
      expect(isExternalUrl("mailto:support@notesnook.com")).toBe(true);
      expect(isExternalUrl("tel:+1234567890")).toBe(true);
    });

    it("identifies internal app protocols and service API hosts as non-external", () => {
      expect(isExternalUrl("file:///Users/app/index.html")).toBe(false);
      expect(isExternalUrl("devtools://devtools/bundled/inspector.html")).toBe(false);
      expect(isExternalUrl("about:blank")).toBe(false);
      expect(isExternalUrl("nn://note/12345")).toBe(false);
      expect(isExternalUrl("notesnook://note/12345")).toBe(false);
      expect(isExternalUrl("https://themes-api.notesnook.com/trpc/themes.query")).toBe(false);
      expect(isExternalUrl("https://api.notesnook.com")).toBe(false);
      expect(isExternalUrl("https://auth.streetwriters.co")).toBe(false);
    });

    it("handles dev server URL env variable if present", () => {
      const origEnv = process.env["ELECTRON_RENDERER_URL"];
      process.env["ELECTRON_RENDERER_URL"] = "http://localhost:5173";

      try {
        expect(isExternalUrl("http://localhost:5173/settings")).toBe(false);
        expect(isExternalUrl("http://localhost:5173")).toBe(false);
        expect(isExternalUrl("https://github.com")).toBe(true);
      } finally {
        if (origEnv !== undefined) {
          process.env["ELECTRON_RENDERER_URL"] = origEnv;
        } else {
          delete process.env["ELECTRON_RENDERER_URL"];
        }
      }
    });

    it("returns false for empty or non-string inputs", () => {
      expect(isExternalUrl("")).toBe(false);
    });
  });
});
