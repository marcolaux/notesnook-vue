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
 *
 * `window.confirm` gates live here (not the store), matching `VaultSection`,
 * so the store stays unit-testable in node. After a delete we rely on the
 * store's `notifyDataChanged` to signal the main window to reload affected
 * notes. Icons are inlined Lucide-style stroke SVGs (the codebase has no
 * shared icon module and `@mdi/js` is not installed).
 */
import { ref, computed, onMounted } from "vue";
import { Surface, Flex, Text, Button, Input } from "@notesnook-vue/ui-vue";
import { useAttachmentsStore } from "@/stores/attachments";
import {
  ATTACHMENT_FILTERS,
  formatBytes,
  mimeCategory
} from "@/utils/attachments";
import type { Attachment, Note } from "@notesnook-vue/contracts";

const attachments = useAttachmentsStore();

onMounted(() => {
  void attachments.load();
});

const search = ref("");
const expanded = ref<Set<string>>(new Set());

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
  const name = a.filename || "this attachment";
  if (
    !window.confirm(
      `Delete "${name}"? It will be removed from any notes that use it. This cannot be undone.`
    )
  )
    return;
  await attachments.remove(a);
}

async function onRemoveOrphaned(): Promise<void> {
  if (attachments.counts.orphaned === 0) return;
  if (
    !window.confirm(
      `Delete ${attachments.counts.orphaned} orphaned attachment(s)? This cannot be undone.`
    )
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
        <Text as="h2" variant="heading" size="md">Attachments</Text>
        <Text variant="body" size="xs" class="text-text-muted">
          {{ attachments.counts.all }} items · {{ formatBytes(attachments.totalBytes) }}
          <template v-if="attachments.counts.orphaned > 0">
            · {{ attachments.counts.orphaned }} orphaned ({{ formatBytes(attachments.orphanedBytes) }})
          </template>
        </Text>
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
          {{ f.label }}
          <span
            class="rounded px-1 text-[10px] tabular-nums"
            :class="
              attachments.filter === f.id
                ? 'bg-black/10 text-accent-foreground'
                : 'bg-hover text-text-muted'
            "
            >{{ attachments.counts[f.id] }}</span
          >
        </button>
      </Flex>

      <!-- Toolbar: search + remove-orphaned -->
      <Flex direction="row" align="center" :gap="2">
        <div class="relative min-w-0 flex-1">
          <svg
            class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input v-model="search" block placeholder="Search attachments" class="pl-7" />
        </div>
        <Button
          v-if="attachments.counts.orphaned > 0"
          variant="danger"
          size="sm"
          @click="onRemoveOrphaned"
        >
          Remove orphaned ({{ attachments.counts.orphaned }})
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
        <svg
          class="animate-spin"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="m4.93 4.93 2.83 2.83" />
          <path d="m16.24 16.24 2.83 2.83" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="m4.93 19.07 2.83-2.83" />
          <path d="m16.24 7.76 2.83-2.83" />
        </svg>
        <Text variant="body" size="sm">Loading…</Text>
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
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <Text variant="body" size="sm">
          {{ attachments.filter === "orphaned" ? "No orphaned attachments" : "No attachments" }}
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
            <svg
              v-if="mimeCategory(a.mimeType) === 'image'"
              class="shrink-0 text-text-muted"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
            </svg>
            <svg
              v-else-if="mimeCategory(a.mimeType) === 'video'"
              class="shrink-0 text-text-muted"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m22 8-6 4 6 4V8Z" />
              <rect x="2" y="6" width="14" height="12" rx="2" />
            </svg>
            <svg
              v-else-if="mimeCategory(a.mimeType) === 'audio'"
              class="shrink-0 text-text-muted"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <svg
              v-else-if="mimeCategory(a.mimeType) === 'document'"
              class="shrink-0 text-text-muted"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
              <line x1="10" x2="8" y1="9" y2="9" />
            </svg>
            <svg
              v-else
              class="shrink-0 text-text-muted"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>

            <Flex direction="column" class="min-w-0 flex-1">
              <Text variant="body" size="sm" class="truncate">{{ a.filename || "Untitled" }}</Text>
              <Text variant="body" size="xs" class="text-text-muted">
                {{ a.mimeType }} · {{ formatBytes(a.size) }}
              </Text>
            </Flex>

            <span
              v-if="isOrphaned(a)"
              class="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500"
              >Orphaned</span
            >

            <Button
              iconOnly
              variant="ghost"
              size="sm"
              :aria-label="expanded.has(a.hash) ? 'Hide usage' : 'Show usage'"
              :title="expanded.has(a.hash) ? 'Hide usage' : 'Show usage'"
              @click="toggle(a)"
            >
              <svg
                :class="expanded.has(a.hash) ? 'rotate-90' : ''"
                class="transition-transform"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Button>

            <Button
              iconOnly
              variant="ghost"
              size="sm"
              aria-label="Delete"
              title="Delete"
              @click="onDelete(a)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
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
              <svg
                class="animate-spin"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <path d="M12 2v4" />
                <path d="M12 18v4" />
                <path d="m4.93 4.93 2.83 2.83" />
                <path d="m16.24 16.24 2.83 2.83" />
                <path d="M2 12h4" />
                <path d="M18 12h4" />
                <path d="m4.93 19.07 2.83-2.83" />
                <path d="m16.24 7.76 2.83-2.83" />
              </svg>
              <Text variant="body" size="xs">Loading usage…</Text>
            </Flex>
            <template v-else>
              <Flex v-if="notesFor(a).length === 0" direction="row" :gap="2">
                <Text variant="body" size="xs" class="text-text-muted"
                  >Not used by any note.</Text
                >
              </Flex>
              <Flex v-else direction="column" :gap="1">
                <Text variant="body" size="xs" class="text-text-muted">
                  Used by {{ notesFor(a).length }} note(s):
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
                  <Text variant="body" size="xs" class="truncate">{{ n.title || "Untitled" }}</Text>
                  <Button
                    iconOnly
                    variant="ghost"
                    size="sm"
                    aria-label="Open in new window"
                    title="Open in new window"
                    @click="onOpen(n)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
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