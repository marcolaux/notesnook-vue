/*
Ported verbatim from @notesnook/editor (GPL-3.0), utils/sandbox.ts.

Returns the iframe `sandbox` feature list for an embed src. Only http(s) URLs
get a permissive feature set; anything else (data:, about:, malformed) gets
an empty sandbox (browser default = maximum restriction), matching upstream.
*/
export function getSandboxFeatures(src: string): string {
  const features: string[] = [];
  try {
    const url = new URL(src);
    if (url.protocol === "http:" || url.protocol === "https:") {
      features.push(
        "allow-scripts",
        "allow-same-origin",
        "allow-popups",
        "allow-popups-to-escape-sandbox",
        "allow-forms",
        "allow-modals",
        "allow-downloads",
        "allow-presentation"
      );
    }
  } catch {
    // ignore — non-URL src yields an empty sandbox
  }
  return features.join(" ");
}