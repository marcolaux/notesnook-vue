/*
Real db-backed resolvers for the Standard Notes → Notesnook importer. The pure
converter (`lexicalToTipTapHtml`) takes a `Resolvers` pair; this module supplies
the production resolvers that read media off disk (via the `desktop.importFs`
bridge), store them as encrypted Notesnook attachments (`db.attachments.save`),
and create/look up tags (`db.tags.find`/`add`). De-dup caches keyed by fileUuid
/ data URL / tag title mean a media file referenced by N notes is stored once.

Used by the Settings → Import section, which builds a throwaway account-scoped
`Database` (`createDesktopPlatform` + `initDatabase`) and passes it here. The
resolvers are per-run (one set of caches per import), shared across all notes.

Pure helpers (`buildMediaIndex`, `sniffMime`, `mimeFromName`, `bytesToBase64`,
`base64ToUint8Array`) live in `sn-importer-utils.ts` so they are unit-testable
without Electron. This module only adds the Electron/db-bound glue
(`desktop.importFs`, `db.attachments.save`, `db.tags`, `readImageDimensions`).
*/
import type { Database } from "@notesnook-vue/contracts";
import { desktop } from "@/platform/desktop-bridge";
import { readImageDimensions } from "@/editor/attachments-bridge";
import {
  buildMediaIndex,
  sniffMime,
  mimeFromName,
  bytesToBase64,
  base64ToUint8Array
} from "@/editor/sn-importer-utils";
import type {
  Resolvers,
  AttachmentInput,
  AttachmentRef,
  TagRef
} from "@notesnook-vue/editor-vue";

export { buildMediaIndex, sniffMime } from "@/editor/sn-importer-utils";

/** Best-effort image dimensions from raw bytes (builds a data URL and decodes
 *  via the renderer `Image` — DOM-bound, so it stays here, not in the utils). */
async function imageDimensions(
  bytes: Uint8Array,
  mime: string
): Promise<{ width?: number; height?: number; aspectRatio?: number }> {
  if (!mime.startsWith("image/")) return {};
  try {
    const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
    const dims = await readImageDimensions(dataUrl);
    if (!dims) return {};
    return { width: dims.width, height: dims.height, aspectRatio: dims.aspectRatio };
  } catch {
    return {};
  }
}

/**
 * Create per-run resolvers bound to a target-account `Database` and an import
 * folder. `mediaIndex` (from `buildMediaIndex`) resolves snfile `fileUuid`s to
 * on-disk filenames. Caches de-dup across the whole import run.
 */
export function makeResolvers(
  db: Database,
  baseDir: string,
  mediaIndex: Map<string, string>
): Resolvers {
  const attachmentByUuid = new Map<string, AttachmentRef | null>();
  const attachmentByDataUrl = new Map<string, AttachmentRef | null>();
  const tagByTitle = new Map<string, TagRef | null>();

  async function storeBytes(bytes: Uint8Array, mime: string, filename: string): Promise<AttachmentRef | null> {
    const base64 = bytesToBase64(bytes);
    const hash = await db.attachments.save(base64, mime, filename);
    if (!hash) return null;
    const dims = await imageDimensions(bytes, mime);
    return {
      hash,
      filename,
      mime,
      size: bytes.length,
      ...dims
    };
  }

  return {
    async resolveAttachment(input: AttachmentInput): Promise<AttachmentRef | null> {
      if (input.kind === "snfile") {
        const key = input.fileUuid.toLowerCase();
        const cached = attachmentByUuid.get(key);
        if (cached !== undefined) return cached;
        const name = mediaIndex.get(key);
        if (!name) {
          attachmentByUuid.set(key, null);
          return null;
        }
        try {
          // tRPC infers readBytes' Uint8Array output as a structural subset (no
          // methods), matching `desktop.fs.readChunk` — cast to the real type.
          const bytes = (await desktop.importFs.readBytes.query({ dir: baseDir, name })) as Uint8Array;
          const mime = mimeFromName(name) ?? sniffMime(bytes);
          const ref = await storeBytes(bytes, mime, name);
          attachmentByUuid.set(key, ref);
          return ref;
        } catch {
          attachmentByUuid.set(key, null);
          return null;
        }
      }
      // inline
      const cached = attachmentByDataUrl.get(input.dataUrl);
      if (cached !== undefined) return cached;
      try {
        // parseDataUrl lives in attachments-bridge (re-imported here to keep
        // the data-URL decode consistent with the paste/drop path).
        const { parseDataUrl } = await import("@/editor/attachments-bridge");
        const parsed = parseDataUrl(input.dataUrl);
        if (!parsed) {
          attachmentByDataUrl.set(input.dataUrl, null);
          return null;
        }
        const bytes = base64ToUint8Array(parsed.base64);
        const mime = input.mime ?? parsed.mime;
        const filename = input.fileName ?? "inline-file";
        const ref = await storeBytes(bytes, mime, filename);
        attachmentByDataUrl.set(input.dataUrl, ref);
        return ref;
      } catch {
        attachmentByDataUrl.set(input.dataUrl, null);
        return null;
      }
    },

    async resolveTag(title: string): Promise<TagRef | null> {
      const norm = title.trim();
      if (!norm) return null;
      const key = norm.toLowerCase();
      const cached = tagByTitle.get(key);
      if (cached !== undefined) return cached;
      try {
        const tag = await db.tags.find(norm);
        let id = tag?.id;
        if (!id) {
          id = await db.tags.add({ title: norm });
        }
        const ref = id ? { id, title: norm } : null;
        tagByTitle.set(key, ref);
        return ref;
      } catch {
        tagByTitle.set(key, null);
        return null;
      }
    }
  };
}