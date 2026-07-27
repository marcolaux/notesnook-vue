<script setup lang="ts">
/**
 * Monographs view — the published-notes list with copy-URL / open-in-browser /
 * unpublish actions, backed by the headless `useMonographsStore` (which wraps
 * `db.monographs`). Rendered directly by `<RouterView />` in ShellLayout — the
 * root assumes a `min-h-0 flex-1 min-w-0` flex context. Mirrors
 * `ArchiveView.vue` / `TrashView.vue`.
 *
 * Labels resolve via vue-i18n (`monographs.*` / `common.*`). The public URL
 * is the authoritative server-returned `Monograph.publishUrl` (read via
 * `formatPublishUrl` in the store) — self-hosters get the correct URL because
 * their API server returns their monograph server's.
 *
 * `totalViews` is lazy-loaded by the store via `db.monographs.metadata(id)`
 * (server round-trip; falls back to 0 on failure). `window.open` is intercepted
 * by the main process's `setWindowOpenHandler` → `shell.openExternal`, so "Open
 * in browser" opens the system browser. Unpublish uses the headless
 * `useDialogStore.confirm` overlay for confirmation.
 */
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useMonographsStore, type MonographsListItem } from "@/stores/monographs";
import { useDialogStore } from "@/stores/dialog";
import { useContextMenuStore } from "@/stores/context-menu";
import { separator, type MenuItem } from "@/utils/context-menu";

const monographs = useMonographsStore();
const dialog = useDialogStore();
const contextMenu = useContextMenuStore();
const { t } = useI18n();

onMounted(() => {
  void monographs.load();
});

/** Same-day → HH:MM, otherwise a short `Mon D, YYYY` date. Inlined here to
 *  match ArchiveView / TrashView (it isn't exported from a shared util yet). */
function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  });
}

/** Copy the row's public URL to the clipboard. */
function copyUrl(item: MonographsListItem): void {
  if (item.publishUrl) void navigator.clipboard.writeText(item.publishUrl);
}

/** Open the row's monograph in the system browser (`window.open` →
 *  `shell.openExternal`). */
function openInBrowser(item: MonographsListItem): void {
  if (item.publishUrl) window.open(item.publishUrl, "_blank", "noopener");
}

/** Unpublish the note (confirm-gated), then the store reloads this list. */
async function unpublishItem(item: MonographsListItem): Promise<void> {
  const ok = await dialog.confirm({
    title: t("monographs.unpublish"),
    message: t("monographs.unpublishConfirm", { title: item.title }),
    confirmLabel: t("monographs.unpublish"),
    cancelLabel: t("common.cancel"),
    danger: true
  });
  if (!ok) return;
  await monographs.unpublish([item.id]);
}

/** Right-click a monograph row → Copy URL / Open / Unpublish. */
function onRowContext(item: MonographsListItem, e: MouseEvent): void {
  const items: MenuItem[] = [
    { id: "copy-url", label: t("monographs.copyUrl"), onSelect: () => copyUrl(item) },
    { id: "open", label: t("monographs.openInBrowser"), onSelect: () => openInBrowser(item) },
    separator("sep"),
    {
      id: "unpublish",
      label: t("monographs.unpublish"),
      danger: true,
      onSelect: () => void unpublishItem(item)
    }
  ];
  contextMenu.show(items, e.clientX, e.clientY);
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col backdrop-blur-xl">
    <!-- Header: title + count -->
    <div class="flex h-9 shrink-0 items-center gap-2 border-b border-glass-border px-3">
      <span class="text-xs font-semibold text-text">{{ t("monographs.title") }}</span>
      <span class="text-[10px] text-text-muted">{{ t("monographs.count", { n: monographs.count }) }}</span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <div v-if="monographs.loading && monographs.items.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        {{ t("monographs.loading") }}
      </div>
      <button
        v-for="item in monographs.items"
        :key="item.id"
        class="group block w-full rounded-md px-2 py-1.5 text-left hover:bg-glass-hover"
        @contextmenu.prevent="onRowContext(item, $event)"
      >
        <div class="flex items-center gap-1">
          <span class="truncate text-xs font-medium text-text">{{ item.title }}</span>
          <span
            v-if="item.selfDestruct"
            class="shrink-0 rounded-sm bg-glass-active px-1 text-[8px] text-text-muted"
            :title="t('monographs.selfDestructTitle')"
          >1×</span>
          <span class="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-text-muted hover:bg-glass-active hover:text-text"
              :title="t('monographs.copyPublicUrlTitle')"
              @click.stop="copyUrl(item)"
            >
              {{ t("monographs.copyUrl") }}
            </button>
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-text-muted hover:bg-glass-active hover:text-text"
              :title="t('monographs.openInBrowser')"
              @click.stop="openInBrowser(item)"
            >
              {{ t("monographs.open") }}
            </button>
            <button
              class="titlebar-no-drag rounded-sm px-1 py-0.5 text-[9px] text-rose-300/80 hover:bg-glass-active"
              :title="t('monographs.unpublish')"
              @click.stop="unpublishItem(item)"
            >
              {{ t("monographs.unpublish") }}
            </button>
          </span>
        </div>
        <div class="mt-0.5 flex items-center gap-1.5 text-[9px] text-text-muted">
          <span v-if="item.totalViews !== undefined" :title="t('monographs.totalViewsTitle')">{{ t("monographs.views", { n: item.totalViews }) }}</span>
          <span v-if="item.publishUrl" class="truncate">{{ item.publishUrl }}</span>
          <span class="ml-auto shrink-0">{{ t("monographs.published") }} {{ formatDate(item.datePublished) }}</span>
        </div>
      </button>
      <div v-if="!monographs.loading && monographs.items.length === 0" class="px-2 py-4 text-center text-[10px] text-text-muted">
        {{ t("monographs.empty") }}
      </div>
    </div>
  </div>
</template>