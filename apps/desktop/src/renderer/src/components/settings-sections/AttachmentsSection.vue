<script setup lang="ts">
/**
 * Attachments settings section — browse and manage encrypted per-account
 * attachments (images, videos, audio, documents, orphaned). Backed by
 * `useAttachmentsStore` → `db.attachments` + `db.relations`; orphan detection
 * and "which notes use this attachment" are built into core, and local mode
 * works via `ensureLocalUser` (no auth gate).
 *
 *  - Filter tabs (All / Images / Videos / Audio / Documents / Orphaned) with
 *    live count badges (built on-site — the ui-vue library has no Tabs).
 *  - Search (client-side filename filter).
 *  - Per row: mime icon, filename, mime + size, an "Orphaned" chip, a usage
 *    toggle (lists linked notes with "Open" → `desktop.window.openNote` opens
 *    the note in a new focused window), and a delete button.
 *  - "Remove orphaned" bulk action.
 *  - Image-compression preference (per-account): a `<select>` over the config
 *    store's `imageCompression` ref (Ask every time / Compress / Don't compress),
 *    written through `config.setImageCompression` to the ctx-suffixed
 *    localStorage key. The value is reloaded on an account switch by
 *    `switchContext` → `config.loadClientPrefs`, so the select reflects the
 *    active account without any extra wiring here.
 *
 * `window.confirm` gates live here (not the store), matching `VaultSection`,
 * so the store stays unit-testable in node. After a delete we rely on the
 * store's `notifyDataChanged` to signal the main window to reload affected
 * notes. Icons use the shared `Icon` (ui-vue) over the `@lucide/vue` registry.
 */
import { ref, computed, onMounted, watch } from "vue";
import { Surface, Flex, Text, Button, Input, Icon } from "@notesnook-vue/ui-vue";
import { useI18n } from "vue-i18n";
import { useAttachmentsStore } from "@/stores/attachments";
import { useAuthStore } from "@/stores/auth";
import { useConfigStore, ImageCompressionOptions } from "@/stores/config";
import {
  ATTACHMENT_FILTERS,
  formatBytes,
  mimeCategory
} from "@/utils/attachments";
import type { Attachment, Note } from "@notesnook-vue/contracts";

const attachments = useAttachmentsStore();
const auth = useAuthStore();
const config = useConfigStore();
const { t } = useI18n();

const search = ref("");
const expanded = ref<Set<string>>(new Set());

/** Image-compression preference options (per-account; mirrors upstream's
 *  `ImageCompressionOptions` enum). Labels resolve via `t()` so they
 *  re-evaluate on a locale change. */
const compressionOptions = computed<{ value: ImageCompressionOptions; label: string }[]>(() => [
  { value: ImageCompressionOptions.ASK_EVERY_TIME, label: t("settings.attachments.imageCompressionAsk") },
  { value: ImageCompressionOptions.ENABLE, label: t("settings.attachments.imageCompressionEnable") },
  { value: ImageCompressionOptions.DISABLE, label: t("settings.attachments.imageCompressionDisable") }
]);

function pickImageCompression(e: Event): void {
  config.setImageCompression(Number((e.target as HTMLSelectElement).value) as ImageCompressionOptions);
}

onMounted(() => {
  void attachments.load();
});

// The section lives under each account group, so the same component instance
// stays mounted when the user navigates from one account's Attachments to
// another's — `onMounted` won't re-fire. `switchContext` (SettingsLayout) live-
// swaps the DB singleton and bumps `auth.contextChangeSignal`; reload from the
// new account's DB here, resetting the per-row expand state + cached usage so no
// stale cross-account data lingers (attachments are content-addressed by hash).
watch(
  () => auth.contextChangeSignal,
  () => {
    expanded.value = new Set();
    attachments.clearUsage();
    void attachments.load();
  }
);

const filtered = computed<Attachment[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return attachments.items;
  return attachments.items.filter((a) =>
    (a.filename ?? "").toLowerCase().includes(q)
  );
});

function isOrphaned(a: Attachment): boolean {
  return attachments.orphanedIds.has(a.id);
}

function notesFor(a: Attachment): Note[] {
  return attachments.usage[a.hash] ?? [];
}

function toggle(a: Attachment): void {
  if (expanded.value.has(a.hash)) {
    expanded.value.delete(a.hash);
    return;
  }
  expanded.value.add(a.hash);
  if (!attachments.usage[a.hash]) void attachments.loadUsage(a);
}

async function onDelete(a: Attachment): Promise<void> {
  const name = a.filename || t("settings.attachments.deleteThis");
  if (!window.confirm(t("settings.attachments.deleteConfirm", { name }))) return;
  await attachments.remove(a);
}

async function onRemoveOrphaned(): Promise<void> {
  if (attachments.counts.orphaned === 0) return;
  if (
    !window.confirm(t("settings.attachments.deleteOrphanedConfirm", { n: attachments.counts.orphaned }))
  )
    return;
  await attachments.removeOrphaned();
}

async function onOpen(n: Note): Promise<void> {
  await attachments.openNote(n.id);
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Flex direction="row" align="center" justify="between">
        <Text as="h2" variant="heading" size="md">{{ t("settings.attachments.title") }}</Text>
        <Text variant="body" size="xs" class="text-text-muted">
          {{ t("settings.attachments.summary", { all: attachments.counts.all, bytes: formatBytes(attachments.totalBytes) }) }}
          <template v-if="attachments.counts.orphaned > 0">
            {{ t("settings.attachments.orphanedSummary", { n: attachments.counts.orphaned, bytes: formatBytes(attachments.orphanedBytes) }) }}
          </template>
        </Text>
      </Flex>

      <!-- Image compression preference (per-account) -->
      <Flex direction="column" :gap="1">
        <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.attachments.imageCompression") }}</Text>
        <select
          :value="config.imageCompression"
          class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          @change="pickImageCompression"
        >
          <option v-for="o in compressionOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <Text variant="body" size="xs" class="text-text-muted">{{ t("settings.attachments.imageCompressionHint") }}</Text>
      </Flex>

      <!-- Filter tabs -->
      <Flex direction="row" :gap="1" wrap class="rounded-md border border-border p-0.5">
        <button
          v-for="f in ATTACHMENT_FILTERS"
          :key="f.id"
          type="button"
          class="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors"
          :class="
            attachments.filter === f.id
              ? 'bg-accent text-accent-foreground'
              : 'text-text-muted hover:bg-hover'
          "
          @click="attachments.setFilter(f.id)"
        >
          {{ t(f.label) }}
          <span
            class="rounded px-1 text-[10px] tabular-nums"
            :class="
              attachments.filter === f.id
                ? 'bg-accent text-accent-foreground'
                : 'bg-hover text-text-muted'
            "
            >{{ attachments.counts[f.id] }}</span
          >
        </button>
      </Flex>

      <!-- Toolbar: search + remove-orphaned -->
      <Flex direction="row" align="center" :gap="2">
        <div class="relative min-w-0 flex-1">
          <Icon
            name="search"
            :size="14"
            class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input v-model="search" block :placeholder="t('settings.attachments.searchPlaceholder')" class="pl-7" />
        </div>
        <Button
          v-if="attachments.counts.orphaned > 0"
          variant="danger"
          size="sm"
          @click="onRemoveOrphaned"
        >
          {{ t("settings.attachments.removeOrphanedCount", { n: attachments.counts.orphaned }) }}
        </Button>
      </Flex>

      <Text v-if="attachments.error" variant="body" size="xs" class="text-[var(--red-static)]">
        {{ attachments.error }}
      </Text>

      <!-- Loading -->
      <Flex
        v-if="attachments.loading"
        direction="row"
        align="center"
        justify="center"
        :gap="2"
        class="py-10 text-text-muted"
      >
        <Icon name="loader-circle" :size="16" spin />
        <Text variant="body" size="sm">{{ t("settings.attachments.loading") }}</Text>
      </Flex>

      <!-- Empty -->
      <Flex
        v-else-if="filtered.length === 0"
        direction="column"
        align="center"
        justify="center"
        :gap="2"
        class="py-10 text-text-muted"
      >
        <Icon name="file-text" :size="28" :stroke-width="1.5" class="text-text-muted" />
        <Text variant="body" size="sm">
          {{ attachments.filter === "orphaned" ? t("settings.attachments.noOrphaned") : t("settings.attachments.noAttachments") }}
        </Text>
      </Flex>

      <!-- List -->
      <Flex v-else direction="column" :gap="1">
        <div
          v-for="a in filtered"
          :key="a.id"
          class="rounded-md border border-border"
        >
          <Flex direction="row" align="center" :gap="3" class="px-3 py-2">
            <!-- mime icon -->
            <Icon
              v-if="mimeCategory(a.mimeType) === 'image'"
              name="image"
              :size="18"
              class="shrink-0 text-text-muted"
            />
            <Icon
              v-else-if="mimeCategory(a.mimeType) === 'video'"
              name="video"
              :size="18"
              class="shrink-0 text-text-muted"
            />
            <Icon
              v-else-if="mimeCategory(a.mimeType) === 'audio'"
              name="audio-lines"
              :size="18"
              class="shrink-0 text-text-muted"
            />
            <Icon
              v-else-if="mimeCategory(a.mimeType) === 'document'"
              name="file-text"
              :size="18"
              class="shrink-0 text-text-muted"
            />
            <Icon v-else name="file" :size="18" class="shrink-0 text-text-muted" />

            <Flex direction="column" class="min-w-0 flex-1">
              <Text variant="body" size="sm" class="truncate">{{ a.filename || t("common.untitled") }}</Text>
              <Text variant="body" size="xs" class="text-text-muted">
                {{ a.mimeType }} · {{ formatBytes(a.size) }}
              </Text>
            </Flex>

            <span
              v-if="isOrphaned(a)"
              class="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500"
              >{{ t("settings.attachments.orphaned") }}</span
            >

            <Button
              iconOnly
              variant="ghost"
              size="sm"
              :aria-label="expanded.has(a.hash) ? t('settings.attachments.hideUsage') : t('settings.attachments.showUsage')"
              :title="expanded.has(a.hash) ? t('settings.attachments.hideUsage') : t('settings.attachments.showUsage')"
              @click="toggle(a)"
            >
              <Icon
                name="chevron-right"
                :size="14"
                class="transition-transform"
                :class="expanded.has(a.hash) ? 'rotate-90' : ''"
              />
            </Button>

            <Button
              iconOnly
              variant="ghost"
              size="sm"
              :aria-label="t('common.delete')"
              :title="t('common.delete')"
              @click="onDelete(a)"
            >
              <Icon name="trash-2" :size="14" />
            </Button>
          </Flex>

          <!-- Usage panel -->
          <div v-if="expanded.has(a.hash)" class="border-t border-border px-3 py-2">
            <Flex
              v-if="attachments.usageLoading[a.hash]"
              direction="row"
              align="center"
              :gap="2"
              class="text-text-muted"
            >
              <Icon name="loader-circle" :size="12" spin />
              <Text variant="body" size="xs">{{ t("settings.attachments.loadingUsage") }}</Text>
            </Flex>
            <template v-else>
              <Flex v-if="notesFor(a).length === 0" direction="row" :gap="2">
                <Text variant="body" size="xs" class="text-text-muted"
                  >{{ t("settings.attachments.notUsedByNote") }}</Text
                >
              </Flex>
              <Flex v-else direction="column" :gap="1">
                <Text variant="body" size="xs" class="text-text-muted">
                  {{ t("settings.attachments.usedBy", { n: notesFor(a).length }) }}
                </Text>
                <Flex
                  v-for="n in notesFor(a)"
                  :key="n.id"
                  direction="row"
                  align="center"
                  justify="between"
                  :gap="2"
                  class="rounded px-2 py-1 hover:bg-hover"
                >
                  <Text variant="body" size="xs" class="truncate">{{ n.title || t("common.untitled") }}</Text>
                  <Button
                    iconOnly
                    variant="ghost"
                    size="sm"
                    :aria-label="t('settings.attachments.openInNewWindow')"
                    :title="t('settings.attachments.openInNewWindow')"
                    @click="onOpen(n)"
                  >
                    <Icon name="external-link" :size="14" />
                  </Button>
                </Flex>
              </Flex>
            </template>
          </div>
        </div>
      </Flex>
    </Flex>
  </Surface>
</template>