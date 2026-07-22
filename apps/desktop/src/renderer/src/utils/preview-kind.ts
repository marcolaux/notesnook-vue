/**
 * Pure mime → preview-kind classifier for the attachment-preview pane. Kept
 * separate from the {@link AttachmentPreview} component so the dispatch logic
 * is unit-testable without mounting, and so the chip's dblclick path can reuse
 * the same notion of "previewable".
 *
 * Text-ish mimes (including `text/markdown`) render as raw text in a `<pre>` —
 * no markdown rendering (no new dependency, by design). Unknown/binary mimes
 * fall back to an "Open externally" placeholder.
 */
export type PreviewKind = "pdf" | "text" | "image" | "video" | "audio" | "unsupported";

export function pickPreviewKind(mime: string): PreviewKind {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/x-yaml" ||
    mime === "application/xml"
  ) {
    return "text";
  }
  return "unsupported";
}