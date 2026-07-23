<script setup lang="ts">
/**
 * Attachment preview pane (double-click an attachment chip → opens here in a
 * new right-hand tab). Reads the tab's `attachment` payload from the
 * editor-layout store, fetches the decrypted bytes from `db.attachments`, and
 * renders by mime:
 *  - `application/pdf` → a sandbox-less `<iframe>` (Chromium's built-in PDFium).
 *  - `image/*` → `<img>`, `video/*` → `<video controls>`, `audio/*` → `<audio>`.
 *  - `text/*` (+ json/yaml/xml/javascript) → raw text in a `<pre>` (no markdown
 *    rendering — by design, no new dependency).
 *  - anything else → a placeholder with an "Open externally" button that writes
 *    the decrypted bytes to a temp file (via the `shell` tRPC router) and opens
 *    it with the OS default handler.
 *
 * The blob URL is component-local (NOT the shared `OBJECT_URL_CACHE` in
 * editor-vue's downloader, which inline image nodes also use — revoking that
 * on unmount would break inline images of the same hash). Revoked on unmount.
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { getDatabase } from "@/platform/bootstrap";
import { desktop } from "@/platform/desktop-bridge";
import { pickPreviewKind } from "@/utils/preview-kind";
import { formatBytes } from "@/utils/attachments";

const props = defineProps<{ tabId: string }>();
const { t } = useI18n();
const layout = useEditorLayoutStore();

const tab = computed(() => layout.tabs[props.tabId] ?? null);
const attrs = computed(() => tab.value?.attachment);
const kind = computed(() => (attrs.value ? pickPreviewKind(attrs.value.mime) : "unsupported"));

// Chromium's built-in PDFium viewer reads viewer parameters from the URL
// fragment. `sidebar=0` hides the page-thumbnail previews panel (the default
// left-hand sidebar), `pagemode=none` keeps it from re-opening on scroll.
// Toolbar is left intact so the user still has page/zoom controls.
const PDF_VIEWER_PARAMS = "#sidebar=0&pagemode=none";
const pdfSrc = computed(() => (blobUrl.value ? blobUrl.value + PDF_VIEWER_PARAMS : undefined));

const text = ref<string>("");
const blobUrl = ref<string | undefined>(undefined);
const loading = ref(false);
const error = ref<string | undefined>(undefined);

/**
 * Ensure the attachment's encrypted blob is local before reading. Non-image
 * attachments (pdf/text/audio/video/docs) are NOT fetched by
 * `db.attachments.downloadMedia` (which covers only images + webclips), so a
 * synced attachment opened in this preview pane can have its metadata but no
 * local blob → `db.attachments.read` returns empty. This queues a single
 * download via `db.fs().downloadFile` (which uses the same `FileStorage`
 * transfer path as sync) and awaits it. No-op + fast-return when the blob is
 * already local. Never throws — a failed download just leaves the read to
 * surface the "no data" error as before.
 */
async function ensureDownloaded(hash: string): Promise<void> {
  try {
    const db = getDatabase();
    const attachment = await db.attachments.attachment(hash);
    if (!attachment) return;
    await db.fs().downloadFile(`preview-${hash}`, hash, attachment.chunkSize);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[AttachmentPreview] ensureDownloaded failed:", e);
  }
}

async function load(): Promise<void> {
  const a = attrs.value;
  if (!a) return;
  loading.value = true;
  error.value = undefined;
  try {
    const db = getDatabase();
    if (kind.value === "text") {
      let data = await db.attachments.read(a.hash, "text");
      if (!data) {
        await ensureDownloaded(a.hash);
        data = await db.attachments.read(a.hash, "text");
      }
      text.value = typeof data === "string" ? data : "";
    } else if (kind.value !== "unsupported") {
      // `db.attachments.read`'s generic return isn't narrowed by the literal
      // output type in the Database wrapper typing, so cast to the runtime
      // shape (`"uint8array"` → `Uint8Array | undefined`).
      let data = (await db.attachments.read(a.hash, "uint8array")) as Uint8Array | undefined;
      if (!data || data.length === 0) {
        // Blob not local (e.g. a synced attachment never downloaded) — fetch
        // it on demand, then re-read.
        await ensureDownloaded(a.hash);
        data = (await db.attachments.read(a.hash, "uint8array")) as Uint8Array | undefined;
      }
      if (!data || data.length === 0) {
        throw new Error("Attachment read returned no data");
      }
      // `new Uint8Array(data)` yields a `Uint8Array<ArrayBuffer>` (a copy) so
      // the DOM `BlobPart` typing accepts it (the read return is
      // `Uint8Array<ArrayBufferLike>`, whose `buffer` may be SharedArrayBuffer).
      blobUrl.value = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: a.mime }));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[AttachmentPreview] load failed:", e);
    error.value = String(e instanceof Error ? e.message : e);
  } finally {
    loading.value = false;
  }
}

/** "Open externally": write the decrypted bytes to a temp file and launch it
 *  via the OS default handler (Electron `shell.openPath`). */
async function openExternally(): Promise<void> {
  const a = attrs.value;
  if (!a) return;
  error.value = undefined;
  try {
    const db = getDatabase();
    let data = (await db.attachments.read(a.hash, "uint8array")) as Uint8Array | undefined;
    if (!data || data.length === 0) {
      await ensureDownloaded(a.hash);
      data = (await db.attachments.read(a.hash, "uint8array")) as Uint8Array | undefined;
    }
    if (!data || data.length === 0) {
      throw new Error("Attachment read returned no data");
    }
    const { path } = await desktop.shell.writeTemp.mutate({ filename: a.filename, data });
    const err = await desktop.shell.openPath.mutate({ path });
    if (err) throw new Error(err);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[AttachmentPreview] openExternally failed:", e);
    error.value = String(e instanceof Error ? e.message : e);
  }
}

onMounted(load);
onUnmounted(() => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
});
</script>

<template>
  <div class="flex min-h-0 min-w-0 h-full flex-col" :data-attachment-preview="props.tabId">
    <div
      class="flex shrink-0 items-center gap-2 border-b border-glass-border bg-glass-surface px-4 py-2 text-xs text-text-muted"
    >
      <span class="truncate">{{ attrs?.filename ?? t("attachments.previewTitle") }}</span>
      <span v-if="attrs?.mime" class="text-text-muted/70">· {{ attrs.mime }}</span>
      <span v-if="attrs?.size" class="text-text-muted/70">· {{ formatBytes(attrs.size) }}</span>
    </div>
    <div class="relative min-h-0 flex-1 overflow-auto">
      <div v-if="loading" class="p-4 text-xs text-text-muted">Loading…</div>
      <pre
        v-else-if="kind === 'text' && !error"
        class="m-0 whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-text"
        >{{ text }}</pre
      >
      <iframe
        v-else-if="kind === 'pdf' && pdfSrc"
        :src="pdfSrc"
        class="h-full w-full border-0"
        title="PDF preview"
      />
      <img
        v-else-if="kind === 'image' && blobUrl"
        :src="blobUrl"
        class="mx-auto block max-h-full max-w-full object-contain"
        :alt="attrs?.filename ?? ''"
      />
      <video
        v-else-if="kind === 'video' && blobUrl"
        :src="blobUrl"
        controls
        class="mx-auto block max-h-full max-w-full"
      />
      <audio v-else-if="kind === 'audio' && blobUrl" :src="blobUrl" controls class="m-4" />
      <div
        v-else-if="kind === 'unsupported' && !error"
        class="flex flex-col items-center gap-4 p-8 text-center text-sm text-text-muted"
      >
        <p>{{ t("attachments.unsupportedPreview") }}</p>
        <button
          class="rounded-md border border-glass-border bg-glass-hover px-3 py-1 text-text hover:bg-glass-active"
          @click="openExternally"
        >
          {{ t("attachments.openExternally") }}
        </button>
      </div>
      <div v-if="error" class="p-4 text-xs text-[var(--paragraph-error)]">{{ error }}</div>
    </div>
  </div>
</template>