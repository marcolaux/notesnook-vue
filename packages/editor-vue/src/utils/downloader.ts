/*
Ported from @notesnook/editor (GPL-3.0), utils/downloader.ts. Framework-
agnostic attachment/image download + blob-URL helpers used by the image and
(in Phase 6) audio/web-clip node-views.

Scoped differences from upstream:
  - `DataURL` is the vendored minimal helper in `./dataurl.ts` instead of
    `@notesnook/common` (which re-exports core's `DataURL` but pulls React into
    the bundle — a leak the 2.2 work avoided). See `dataurl.ts` for the shapes
    covered and the Phase 6/2.5 swap path.
  - Base64→bytes uses the browser-native `atob` + `Uint8Array` instead of
    Node's `Buffer.from(data, "base64")`, so this module does not rely on the
    renderer's `Buffer` polyfill. (`Buffer` is a Node global; `atob` is native
    to browsers + Electron's renderer + happy-dom.)
  - `downloadImage` / `toDataURL` / `toBlob` are ported verbatim (modulo the
    DataURL + atob swaps) even though their callers (the image `onLoad`
    external-URL download-to-attachment path and the `Mod-c` clipboard copy)
    arrive with the toolbar / Phase 6; porting them now means those phases
    just wire callers.
*/
import { DataURL } from "./dataurl";

export type DownloadOptions = {
  corsHost?: string;
  signal?: AbortSignal;
};

/**
 * macOS uses its own Uniform Type Identifier format instead of mime-types.
 * This is an incomplete map of UTI->mime-type for image types taken from
 * https://gist.github.com/RhetTbull/7221ef3cfd9d746f34b2550d4419a8c2
 */
const UTITypes: Record<string, string> = {
  "com.microsoft.bmp": "image/bmp",
  "com.canon.crw-raw-image": "image/x-canon-crw",
  "com.adobe.raw-image": "image/x-adobe-dng",
  "com.dxo.raw-image": "image/x-dxo-dxo",
  "com.j2.efx-fax": "image/efax",
  "com.epson.raw-image": "image/x-epson-erf",
  "com.kodak.flashpix-image": "image/fpx",
  "com.compuserve.gif": "image/gif",
  "com.microsoft.ico": "image/vnd.microsoft.icon",
  "public.jpeg": "image/jpeg",
  "public.jpeg-2000": "image/jp2",
  "com.nikon.nrw-raw-image": "image/x-nikon-nrw",
  "com.apple.pict": "image/pict",
  "public.png": "image/png",
  "com.adobe.photoshop-image": "image/vnd.adobe.photoshop",
  "com.leica.pwl-raw-image": "image/x-leica-pwl",
  "com.apple.quicktime-image": "image/x-quicktime",
  "com.sgi.sgi-image": "image/sgi",
  "com.sony.sr2-raw-image": "image/x-sony-sr2",
  "public.svg-image": "image/svg+xml",
  "com.truevision.tga-image": "image/targa",
  "public.tiff": "image/tiff",
  "public.xbitmap-image": "image/x-xbitmap",
  "public.avci": "image/avci",
  "public.avcs": "image/avcs",
  "public.heic": "image/heic",
  "public.heif": "image/heif",
  "public.heics": "image/heic-sequence",
  "public.heifs": "image/heif-sequence"
};

export function corsify(url?: string, host?: string): string | undefined {
  if (host && url && !url.startsWith("blob:") && !DataURL.isValid(url))
    return `${host}/${url}`;
  return url;
}

/** Decode a base64 string into an `ArrayBuffer` using the browser-native `atob`. */
function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

export async function downloadImage(
  url: string,
  options?: DownloadOptions
): Promise<
  | { blob: Blob; url: string; mimeType: string; size: number }
  | undefined
> {
  const corsifiedURL = corsify(url, options?.corsHost);
  if (!corsifiedURL) return;

  // Build `RequestInit` conditionally so `signal` is not explicitly `undefined`
  // (the lib types it `AbortSignal | null` under `exactOptionalPropertyTypes`).
  const init: RequestInit = {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache"
  };
  if (options?.signal) init.signal = options.signal;
  const response = await fetch(corsifiedURL, init);
  if (!response.ok) throw new Error(`invalid status code ${response.status}`);

  let contentType = response.headers.get("Content-Type");

  if (contentType) {
    const mapped = UTITypes[contentType];
    if (mapped) contentType = mapped;
  }

  if (!contentType || !contentType.startsWith("image/")) return;

  let blob = await response.blob();
  if (UTITypes[blob.type])
    blob = new Blob([blob], {
      type: contentType
    });

  return {
    blob,
    url: URL.createObjectURL(blob),
    mimeType: contentType,
    size: blob.size
  };
}

export function toDataURL(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error("Read aborted"));
    reader.readAsDataURL(blob);
  });
}

const OBJECT_URL_CACHE: Record<string, string | undefined> = {};
export function toBlobURL(
  dataurl: string,
  type: "image" | "other" = "other",
  mimeType?: string,
  id?: string
): string | undefined {
  if (id && OBJECT_URL_CACHE[id]) return OBJECT_URL_CACHE[id];
  if (!DataURL.isValid(dataurl)) return;

  const dataurlObject = DataURL.toObject(dataurl);
  let mime = dataurlObject.mimeType || "";
  const data = dataurlObject.data;

  if (!data) return;

  // sometimes the provided mime type in the dataurl can be wrong so we
  // fallback and make sure the browser loads the image properly.
  if (type === "image" && !mime.startsWith("image/")) {
    mime = mimeType && mimeType.startsWith("image/") ? mimeType : "image/*";
  }

  const objectURL = URL.createObjectURL(
    new Blob([base64ToBytes(data)], { type: mime })
  );

  if (id) OBJECT_URL_CACHE[id] = objectURL;
  return objectURL;
}

export function revokeBloburl(id: string): void {
  const url = OBJECT_URL_CACHE[id];
  if (!url) return;

  URL.revokeObjectURL(url);
  OBJECT_URL_CACHE[id] = undefined;
}

export function toBlob(dataurl: string, mimeType: string): Blob | undefined {
  if (!DataURL.isValid(dataurl)) return;

  const dataurlObject = DataURL.toObject(dataurl);
  const data = dataurlObject.data;
  if (!data) return;

  return new Blob([base64ToBytes(data)], {
    type: mimeType
  });
}