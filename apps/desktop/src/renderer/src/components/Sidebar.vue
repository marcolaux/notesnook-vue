<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useNotesStore } from "@/stores/notes";
import { useAuthStore } from "@/stores/auth";
import { useCollectionsStore } from "@/stores/collections";
import { useShortcutsStore } from "@/stores/shortcuts";
import { topViews, bottomViews } from "@/router/routes";
import { desktop } from "@/platform/desktop-bridge";
import NotebookNode from "@/components/NotebookNode.vue";
import type { CollectionType } from "@/stores/collections";

const notes = useNotesStore();
const auth = useAuthStore();
const collections = useCollectionsStore();
const shortcuts = useShortcutsStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** Local collapse for the Shortcuts section (the collections store only owns
 *  notebooks/tags collapse). Expanded by default. */
const shortcutsCollapsed = ref(false);

/** Plain-link top views (All Notes / Monographs / Archive) — Notebooks &
 * Tags render as expandable collection sections below. */
const linkTopViews = topViews.filter(
  (v) => v.name !== "notebooks" && v.name !== "tags"
);
// Settings opens its own window (singleton) via IPC, so it is NOT a router
// link here — render it as a button below the Trash link.
const linkBottomViews = bottomViews.filter((v) => v.name !== "settings");

/** Open the shared Settings window (focused singleton). Best-effort. */
function openSettings(): void {
  void desktop.window.openSettings.mutate().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[sidebar] openSettings failed:", e);
  });
}

/** Active-state is driven by the exact current path (no nested routes here). */
function isActive(path: string): boolean {
  return route.path === path;
}

/** Is a given collection item the currently-selected one? */
function isSelected(type: CollectionType, id: string): boolean {
  return collections.selected?.type === type && collections.selected.id === id;
}

/** "All Notes" drops any active collection filter + selection. */
function showAllNotes(): void {
  notes.clearCollectionFilter();
  collections.clearSelection();
}

/** Select a collection, restrict the notes list to it, and show the notes
 * view. */
async function selectCollection(type: CollectionType, id: string): Promise<void> {
  collections.select(type, id);
  await notes.filterByCollection(type, id);
  void router.push("/all");
}

/** Pin/unpin a notebook or tag as a sidebar shortcut (db.shortcuts). The
 *  `type` matches both `CollectionType` and the shortcut's `itemType`. */
function toggleShortcut(type: CollectionType, id: string): void {
  void shortcuts.toggle(id, type);
}
</script>

<template>
  <nav class="flex h-full flex-col gap-1 overflow-y-auto bg-glass-surface p-2 text-sm">
    <!-- Plain top links (All Notes / Monographs / Archive) -->
    <RouterLink
      v-for="v in linkTopViews"
      :key="v.name"
      :to="v.path"
      class="titlebar-no-drag rounded-md px-2 py-1.5 text-left transition-colors"
      :class="
        isActive(v.path)
          ? 'bg-glass-active text-text'
          : 'text-text hover:bg-glass-hover'
      "
      @click="v.name === 'all' ? showAllNotes() : undefined"
    >
      {{ v.label }}
    </RouterLink>

    <!-- Shortcuts section (expandable; pinned notebooks/tags) -->
    <div v-if="shortcuts.resolved.length > 0" class="mt-1">
      <button
        class="titlebar-no-drag flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-text-muted hover:bg-glass-hover"
        @click="shortcutsCollapsed = !shortcutsCollapsed"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="transition-transform"
          :class="shortcutsCollapsed ? '' : 'rotate-90'"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>{{ t("sidebar.shortcuts") }}</span>
        <span class="ml-auto text-[10px] text-text-muted">{{ shortcuts.resolved.length }}</span>
      </button>
      <div v-if="!shortcutsCollapsed" class="mt-0.5 flex flex-col gap-0.5 pl-3">
        <div
          v-for="sc in shortcuts.resolved"
          :key="sc.id"
          class="group flex items-center gap-1 rounded px-2 py-1 text-left text-[12px] transition-colors"
          :class="
            isSelected(sc.type, sc.id)
              ? 'bg-glass-active text-text'
              : 'text-text hover:bg-glass-hover'
          "
        >
          <button
            class="flex flex-1 items-center gap-1 truncate text-left"
            :title="sc.title"
            @click="selectCollection(sc.type, sc.id)"
          >
            <span class="text-text-muted">{{ sc.type === "notebook" ? "📓" : "#" }}</span>
            <span class="truncate">{{ sc.title }}</span>
          </button>
          <button
            class="titlebar-no-drag shrink-0 text-[10px] text-text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
            :title="t('sidebar.removeFromShortcuts')"
            @click="toggleShortcut(sc.type, sc.id)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- Notebooks section (expandable; pinned-first) -->
    <div class="mt-1">
      <button
        class="titlebar-no-drag flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-text-muted hover:bg-glass-hover"
        @click="collections.toggleSection('notebooks')"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="transition-transform"
          :class="collections.collapsed.notebooks ? '' : 'rotate-90'"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>{{ t("sidebar.notebooks") }}</span>
        <span class="ml-auto text-[10px] text-text-muted">{{ collections.notebookCount }}</span>
      </button>
      <div v-if="!collections.collapsed.notebooks" class="mt-0.5 flex flex-col gap-0.5">
        <NotebookNode
          v-for="node in collections.treeNotebooks"
          :key="node.item.id"
          :node="node"
          :depth="0"
        />
        <div
          v-if="collections.notebookCount === 0"
          class="px-2 py-1 text-[10px] text-text-muted"
        >
          {{ t("sidebar.noNotebooks") }}
        </div>
      </div>
    </div>

    <!-- Tags section (expandable; flat — subtags deferred) -->
    <div class="mt-1">
      <button
        class="titlebar-no-drag flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-text-muted hover:bg-glass-hover"
        @click="collections.toggleSection('tags')"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="transition-transform"
          :class="collections.collapsed.tags ? '' : 'rotate-90'"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>{{ t("sidebar.tags") }}</span>
        <span class="ml-auto text-[10px] text-text-muted">{{ collections.tags.length }}</span>
      </button>
      <div v-if="!collections.collapsed.tags" class="mt-0.5 flex flex-col gap-0.5 pl-3">
        <button
          v-for="tag in collections.sortedTags"
          :key="tag.id"
          class="titlebar-no-drag group flex items-center gap-1 rounded px-2 py-1 text-left text-[12px] transition-colors"
          :class="
            isSelected('tag', tag.id)
              ? 'bg-glass-active text-text'
              : 'text-text hover:bg-glass-hover'
          "
          @click="selectCollection('tag', tag.id)"
        >
          <span class="text-text-muted">#</span>
          <span class="truncate">{{ tag.title }}</span>
          <span
            class="ml-auto shrink-0 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
            :class="shortcuts.isShortcut(tag.id) ? 'text-amber-300/80 opacity-100' : 'text-text-muted'"
            :title="shortcuts.isShortcut(tag.id) ? t('sidebar.removeFromShortcuts') : t('sidebar.addToShortcuts')"
            @click.stop="toggleShortcut('tag', tag.id)"
          >{{ shortcuts.isShortcut(tag.id) ? "★" : "☆" }}</span>
        </button>
        <div
          v-if="collections.tags.length === 0"
          class="px-2 py-1 text-[10px] text-text-muted"
        >
          {{ t("sidebar.noTags") }}
        </div>
      </div>
    </div>

    <div class="flex-1" />

    <!-- Plain bottom links (Trash) -->
    <RouterLink
      v-for="v in linkBottomViews"
      :key="v.name"
      :to="v.path"
      class="titlebar-no-drag rounded-md px-2 py-1.5 text-left transition-colors"
      :class="
        isActive(v.path)
          ? 'bg-glass-active text-text'
          : 'text-text-muted hover:bg-glass-hover'
      "
    >
      <span class="flex items-center gap-1">
        {{ v.label }}
        <span v-if="v.name === 'trash' && collections.trashCount > 0" class="text-[10px] text-text-muted">
          ({{ collections.trashCount }})
        </span>
      </span>
    </RouterLink>

    <!-- Settings opens its own window (singleton) via IPC, not a route. -->
    <button
      class="titlebar-no-drag rounded-md px-2 py-1.5 text-left text-text-muted transition-colors hover:bg-glass-hover"
      @click="openSettings"
    >
      Settings
    </button>

    <!-- Account area -->
    <div v-if="auth.isLoggedIn" class="mt-1 rounded-md bg-glass-surface px-2 py-1.5">
      <div class="truncate text-[11px] text-text-muted">{{ auth.user?.email }}</div>
      <button
        class="mt-1 w-full rounded px-1 py-0.5 text-left text-[10px] text-text-muted hover:bg-glass-hover"
        @click="auth.logout()"
      >
        Log out
      </button>
    </div>
    <button
      v-else
      class="mt-1 rounded-md px-2 py-1.5 text-left text-[11px] text-text-muted hover:bg-glass-hover"
      @click="auth.requestSignIn()"
    >
      Sign in
    </button>

    <div class="mt-1 rounded-md bg-glass-surface px-2 py-1.5 text-[10px] text-text-muted">
      Notes: {{ notes.count }}
    </div>
  </nav>
</template>