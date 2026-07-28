<script setup lang="ts">
/**
 * Import settings section — import Standard Notes notes losslessly from a
 * Standard Notes export folder. Each note is a Lexical `.json` (the lossless
 * source; the `.md` companion is ignored) plus sibling `image-<uuid>` media.
 *
 * The converter (`lexicalToTipTapHtml`, pure) emits TipTap HTML; the resolvers
 * (`makeResolvers`, in `editor/sn-importer-resolvers.ts`) read media off disk
 * via the `desktop.importFs` bridge and store them as encrypted attachments,
 * and create/link hashtags as real Notesnook tags.
 *
 * Target account: Settings is a single shared window (not per-account), so the
 * user picks the account to import into. We build a *throwaway* account-scoped
 * `Database` (`createDesktopPlatform(ctx)` + `initDatabase`) — the same factory
 * pair `bootstrap`/`switchContext` use — WITHOUT assigning the singleton, so
 * the main window's DB and this window's bootstrapped DB are untouched. No
 * live-swap, no core changes, no new IPC. Account contexts are already
 * authenticated (cached User + master key); local is bootstrapped via
 * `ensureLocalUser`. See `platform/{database,bootstrap,account-context}.ts`.
 */
import { ref, computed, onMounted } from "vue";
import { Surface, Flex, Text, Button, Input } from "@notesnook-vue/ui-vue";
import { useI18n } from "vue-i18n";
import { desktop } from "@/platform/desktop-bridge";
import { listAccounts } from "@/platform/account-registry";
import { LOCAL_CONTEXT, isLocal, type ContextId } from "@/platform/account-context";
import { resolveHostsForContext } from "@/platform/bootstrap";
import { createDesktopPlatform, initDatabase } from "@/platform/database";
import { ensureLocalUser } from "@/platform/local-user";
import type { Database } from "@notesnook-vue/contracts";
import { lexicalToTipTapHtml } from "@notesnook-vue/editor-vue";
import { buildMediaIndex, makeResolvers } from "@/editor/sn-importer-resolvers";
import { augmentMediaIndexFromMarkdown } from "@/editor/sn-importer-utils";

const { t } = useI18n();

interface AccountOption {
  contextId: ContextId;
  label: string;
}
const accounts = ref<AccountOption[]>([]);
const selectedContextId = ref<ContextId>(LOCAL_CONTEXT);
const folder = ref<string | null>(null);

type State = "idle" | "running" | "done";
const state = ref<State>("idle");
const total = ref(0);
const done = ref(0);
const attachments = ref(0);
const tagsCount = ref(0);
const failures = ref<string[]>([]);
const info = ref<string | null>(null);
const error = ref<string | null>(null);

const busy = computed(() => state.value === "running");
const canRun = computed(() => !!folder.value && !busy.value);

onMounted(async () => {
  // Populate the account picker: Local first, then every logged-in account.
  const opts: AccountOption[] = [{ contextId: LOCAL_CONTEXT, label: t("settings.import.localAccount") }];
  try {
    const list = await listAccounts();
    for (const a of list) {
      opts.push({ contextId: a.contextId, label: a.label ?? a.email });
    }
  } catch {
    /* ignore — picker still offers Local */
  }
  accounts.value = opts;
});

function pickAccount(e: Event): void {
  selectedContextId.value = (e.target as HTMLSelectElement).value as ContextId;
}

async function onChooseFolder(): Promise<void> {
  error.value = null;
  const dir = await desktop.dialog.selectDirectory.mutate();
  if (dir) {
    folder.value = dir;
    info.value = null;
  }
}

/** Open a throwaway account-scoped `Database` for the chosen context. */
async function openAccountDb(ctx: ContextId): Promise<Database> {
  const hosts = await resolveHostsForContext(ctx);
  const platform = await createDesktopPlatform(ctx);
  const db = await initDatabase(platform, hosts);
  if (isLocal(ctx)) await ensureLocalUser(db);
  return db;
}

/** A file is an importable note if it parses as JSON with a Lexical `root` or a
 *  `text`/`content` field. This naturally skips extensionless media, `.md`
 *  companions, and `image-*` files. */
function isNoteJson(text: string): boolean {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (j && typeof j === "object" && j.root) return true;
    return typeof j.text === "string" || typeof j.content === "string";
  } catch {
    return false;
  }
}

async function runImport(): Promise<void> {
  error.value = null;
  info.value = null;
  failures.value = [];
  if (!folder.value) {
    error.value = t("settings.import.noFolder");
    return;
  }
  state.value = "running";
  done.value = 0;
  attachments.value = 0;
  tagsCount.value = 0;

  let db: Database | undefined;
  try {
    db = await openAccountDb(selectedContextId.value);

    // Recursively enumerate the whole export tree once. `name` is a path
    // RELATIVE to the chosen root (e.g. "sub/note.json", "images/img.png"), so
    // note files and media are found in any subfolder, and the relative paths
    // feed back into readUtf8/readBytes.
    const entries = await desktop.importFs.listRecursive.query({ dir: folder.value });

    // Media index covers the WHOLE tree: a snfile's fileUuid resolves to the
    // first matching file anywhere under the root, even if it's in a different
    // subfolder than the note that references it.
    const mediaIndex = buildMediaIndex(entries);

    // Candidate notes: every `.json` file in the tree. The JSON-parse check
    // below filters out any non-SN JSON (and is the real gate).
    const candidates = entries.filter((e) => !e.isDir && e.name.endsWith(".json"));
    // All file paths in the tree, for companion-`.md` lookup (the markdown
    // carries the on-disk filenames for the legacy extensionless export format
    // where `snfile.fileUuid` ≠ the file's name — see augmentMediaIndexFromMarkdown).
    const entryNames = new Set(entries.filter((e) => !e.isDir).map((e) => e.name));
    total.value = candidates.length;

    if (total.value === 0) {
      info.value = t("settings.import.none");
      state.value = "done";
      return;
    }

    const resolvers = makeResolvers(db, folder.value, mediaIndex);

    for (const file of candidates) {
      try {
        const text = await desktop.importFs.readUtf8.query({ dir: folder.value, name: file.name });
        if (!isNoteJson(text)) {
          total.value -= 1;
          continue;
        }
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const previewTitle =
          typeof parsed.preview_title === "string" ? parsed.preview_title : typeof parsed.title === "string" ? parsed.title : undefined;

        // Legacy-extensionless fallback: if this note's snfile uuids don't
        // match on-disk files by uuid, use the companion `.md`'s ordered local
        // file references to map them positionally (the markdown lists the
        // on-disk files in the same order as the JSON's snfile nodes).
        const mdName = file.name.replace(/\.json$/i, ".md");
        if (entryNames.has(mdName)) {
          try {
            const md = await desktop.importFs.readUtf8.query({ dir: folder.value, name: mdName });
            const noteDir = file.name.includes("/") ? file.name.slice(0, file.name.lastIndexOf("/")) : "";
            augmentMediaIndexFromMarkdown(parsed, md, noteDir, mediaIndex);
          } catch {
            /* no companion markdown — fall back to direct uuid match only */
          }
        }

        const result = await lexicalToTipTapHtml(parsed, resolvers, previewTitle);
        if (!result.html) {
          total.value -= 1;
          continue;
        }
        const noteId = await db.notes.add({
          title: result.title ?? previewTitle ?? "Untitled",
          content: { type: "tiptap", data: result.html }
        });
        // Link hashtags as real tags.
        for (const tagId of result.tagIds) {
          await db.relations.add({ id: noteId, type: "note" }, { id: tagId, type: "tag" });
        }
        done.value += 1;
        attachments.value += result.stats.attachments;
        tagsCount.value += result.stats.tags;
        if (result.stats.failed.length) {
          for (const f of result.stats.failed) failures.value.push(`${file.name}: ${f}`);
        }
      } catch (e) {
        failures.value.push(`${file.name}: ${String(e)}`);
      }
    }

    info.value = t("settings.import.done", {
      n: done.value,
      attachments: attachments.value,
      tags: tagsCount.value
    });
    // Signal the main window to reload its stores if it's showing the target
    // account (the import mutated that account's DB, and core events are
    // per-process so the main window won't see it otherwise). Best-effort.
    void desktop.window.notifyDataChanged.mutate().catch(() => {
      /* main unreachable (e.g. tests) — the import still succeeded */
    });
  } catch (e) {
    error.value = String(e);
  } finally {
    state.value = "done";
    // Drop the throwaway DB reference — let it GC. Core has no teardown; the
    // main-side SQLite connection for this account stays cached (reused if the
    // user opens that account in a window later). We deliberately do NOT call
    // any teardown or touch the singleton.
    db = undefined;
  }
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Text as="h2" variant="heading" size="md">{{ t("settings.import.title") }}</Text>
      <Text variant="body" size="xs" class="text-text-muted">{{ t("settings.import.hint") }}</Text>

      <!-- Account picker -->
      <Flex direction="column" :gap="2">
        <Text variant="body" size="sm" class="text-text">{{ t("settings.import.account") }}</Text>
        <select
          :value="selectedContextId"
          class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          :disabled="busy"
          @change="pickAccount"
        >
          <option v-for="a in accounts" :key="a.contextId" :value="a.contextId">{{ a.label }}</option>
        </select>
      </Flex>

      <!-- Folder picker -->
      <Flex direction="column" :gap="2">
        <Flex direction="row" :gap="2" class="flex-wrap items-center">
          <Input
            :model-value="folder ?? ''"
            readonly
            block
            :placeholder="t('settings.import.folderPlaceholder')"
            class="flex-1"
          />
          <Button variant="secondary" :disabled="busy" @click="onChooseFolder">{{ t("settings.import.chooseFolder") }}</Button>
        </Flex>
        <Text variant="body" size="xs" class="text-text-muted">{{ t("settings.import.folderHint") }}</Text>
      </Flex>

      <!-- Run -->
      <Button variant="primary" :disabled="!canRun" @click="runImport">
        {{ busy ? t("settings.import.running") : t("settings.import.run") }}
      </Button>

      <!-- Progress -->
      <Flex v-if="state !== 'idle'" direction="column" :gap="2">
        <Text v-if="total > 0" variant="body" size="xs" class="text-text-muted">
          {{ t("settings.import.progress", { done, total, attachments, tags: tagsCount }) }}
        </Text>
        <Text v-if="info && state === 'done'" variant="body" size="xs" class="text-[var(--green-static)]">{{ info }}</Text>
        <Text v-if="error" variant="body" size="xs" class="text-[var(--red-static)]">{{ error }}</Text>
        <Flex v-if="failures.length" direction="column" :gap="1">
          <Text variant="body" size="xs" class="text-[var(--red-static)]">{{ t("settings.import.failures") }}</Text>
          <div class="max-h-40 overflow-y-auto rounded-md border border-border bg-surface p-2">
            <Text v-for="(f, i) in failures" :key="i" variant="body" size="xs" class="block text-text-muted">{{ f }}</Text>
          </div>
        </Flex>
      </Flex>
    </Flex>
  </Surface>
</template>