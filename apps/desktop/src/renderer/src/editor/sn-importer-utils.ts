/*
Pure helpers for the Standard Notes importer — no Electron/db/DOM deps, so
they are unit-testable in a node vitest environment. The Electron-bound
resolvers module (`sn-importer-resolvers.ts`) re-uses these.
*/
import type { AttachmentRef } from "@notesnook-vue/editor-vue";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Build a media index: fileUuid → on-disk filename, from a directory listing.
 *  Matches `image-<uuid>.png` (example2 style) and bare `<uuid>.` extensionless
 *  files (example1 style) by extracting the uuid from each non-note filename. */
export function buildMediaIndex(
  entries: { name: string; isDir: boolean }[]
): Map<string, string> {
  const index = new Map<string, string>();
  for (const e of entries) {
    if (e.isDir) continue;
    if (e.name.startsWith(".")) continue;
    if (e.name.endsWith(".json") || e.name.endsWith(".md")) continue;
    const match = e.name.match(UUID_RE);
    if (match) {
      const uuid = match[0].toLowerCase();
      if (!index.has(uuid)) index.set(uuid, e.name);
    }
  }
  return index;
}

/** Magic-byte MIME sniffing for extensionless SN attachments (example1's MP4s
 *  have no extension). Covers the common image/audio/video/pdf types; falls
 *  back to `application/octet-stream`. */
export function sniffMime(bytes: Uint8Array): string {
  if (bytes.length < 4) return "application/octet-stream";
  const b = bytes;
  // Images.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    // RIFF — WebP (VP8) or WAV.
    if (bytes.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
      return "image/webp";
    if (bytes.length >= 12 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45)
      return "audio/wav";
  }
  // Video / audio containers (ISO BMFF / MP4 family).
  if (bytes.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    // `ftyp` box — inspect the brand for audio vs video.
    const brand = String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0);
    if (brand.startsWith("mmp4") || brand.startsWith("mp42") || brand.startsWith("avc1") || brand.startsWith("isom") || brand.startsWith("mp41") || brand.startsWith("dash"))
      return "video/mp4";
    if (brand.startsWith("M4A") || brand.startsWith("M4V")) return "audio/mp4";
    // heic/heif images also use ftyp.
    if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("mif1")) return "image/heic";
    return "video/mp4";
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // Matroska / WebM.
    return "video/webm";
  }
  // Audio.
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return "audio/mpeg"; // ID3
  if (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) return "audio/mpeg"; // MP3 frame
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "audio/ogg";
  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) return "audio/flac";
  // Documents.
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03) return "application/zip";
  return "application/octet-stream";
}

/** MIME from the on-disk filename extension, with sniffing fallback. */
export function mimeFromName(name: string): string | null {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "heic": return "image/heic";
    case "mp4":
    case "m4v": return "video/mp4";
    case "webm": return "video/webm";
    case "mov": return "video/quicktime";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "ogg": return "audio/ogg";
    case "flac": return "audio/flac";
    case "m4a": return "audio/mp4";
    case "pdf": return "application/pdf";
    case "zip": return "application/zip";
    default: return null;
  }
}

/** bytes → base64 (chunked to avoid `String.fromCharCode` stack overflow). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // 32 KiB chunks keep `String.fromCharCode` off the stack limit.
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** base64 → Uint8Array. */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A minimal attachment ref for tests/defaults. */
export function makeRef(hash: string, mime: string, filename = "f"): AttachmentRef {
  return { hash, filename, mime, size: 100 };
}

/** Resolve an editor-state root from a parsed SN note object (`{ root }`), a
 *  `{ text: "<json>" }` note, or a bare root container. Mirrors the converter's
 *  `toRoot` so this helper stays self-contained. */
function extractRoot(editorState: unknown): { children?: unknown[] } | null {
  if (!editorState || typeof editorState !== "object") return null;
  const obj = editorState as Record<string, unknown>;
  if (obj.root && typeof obj.root === "object") return obj.root as { children?: unknown[] };
  const text = typeof obj.text === "string" ? obj.text : typeof obj.content === "string" ? obj.content : null;
  if (text) {
    try {
      return extractRoot(JSON.parse(text));
    } catch {
      return null;
    }
  }
  const maybe = editorState as { type?: string; children?: unknown[] };
  if (maybe.type === "root" || Array.isArray(maybe.children)) return maybe;
  return null;
}

/**
 * Legacy-extensionless fallback. Some Standard Notes exports (e.g. example1)
 * name attachment files by the FileItem's *content* uuid, NOT the
 * `snfile.fileUuid` (the item uuid) — and the note JSON carries no manifest
 * mapping the two. The companion `.md` export, however, lists the on-disk files
 * (`[uuid](./uuid.)`) in the SAME document order as the JSON's `snfile` nodes
 * (the markdown is generated by walking the JSON). So for any `snfile` whose
 * `fileUuid` is NOT already in `mediaIndex`, we map it positionally to the
 * next `./<file>` reference in the markdown, prefixing `noteDir` (the note's
 * folder relative to the import root) so the path resolves from the root.
 *
 * The markdown is used ONLY for the file-name mapping (which the JSON lacks for
 * this format); all content/formatting still comes from the JSON. For the
 * common format (example2: `image-<fileUuid>.png`), `fileUuid` already matches
 * the media index and this fallback assigns nothing.
 *
 * Mutates `mediaIndex` in place. Returns how many snfiles got a fallback path
 * and how many remain unresolved (no uuid match and no markdown ref left).
 */
export function augmentMediaIndexFromMarkdown(
  editorState: unknown,
  markdown: string,
  noteDir: string,
  mediaIndex: Map<string, string>
): { assigned: number; stillMissing: number } {
  const root = extractRoot(editorState);
  if (!root || !Array.isArray(root.children)) return { assigned: 0, stillMissing: 0 };

  const snfileUuids: string[] = [];
  function walk(n: unknown): void {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; fileUuid?: unknown; children?: unknown[] };
    if (node.type === "snfile" && typeof node.fileUuid === "string") {
      snfileUuids.push(node.fileUuid.toLowerCase());
    }
    if (Array.isArray(node.children)) for (const c of node.children) walk(c);
  }
  walk(root);

  // Local-file references from the markdown, in document order. Matches both
  // `[text](./file)` and `![alt](./file)` (the `](./` prefix is common).
  const localRefs = [...markdown.matchAll(/]\(\.\/([^)]+)\)/g)].map((m) => m[1]);

  let li = 0;
  let assigned = 0;
  let stillMissing = 0;
  for (const uuid of snfileUuids) {
    if (mediaIndex.has(uuid)) continue; // resolved by direct uuid match (common format)
    if (li >= localRefs.length) {
      stillMissing++;
      continue;
    }
    const ref = localRefs[li++] ?? "";
    if (!ref) {
      stillMissing++;
      continue;
    }
    const rel = noteDir ? `${noteDir}/${ref}` : ref;
    mediaIndex.set(uuid, rel);
    assigned++;
  }
  return { assigned, stillMissing };
}