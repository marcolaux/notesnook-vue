<script setup lang="ts">
/**
 * Vault settings section — full management on the existing `useVaultStore`:
 *  - No vault: "Create vault" (password + confirm) → `vault.create`.
 *  - Vault exists: lock-after select (synced `vault:lockAfter`) + change
 *    password + clear (unlock all locked notes) + delete vault.
 *
 * The section is always visible (the nav item is ungated) so a user with no
 * vault can create one — matching the upstream vault section, which always
 * lists create-vault and gates only the post-create rows on `isVaultCreated`.
 *
 * Lock-after values are upstream's exact ms options so the synced
 * `vault:lockAfter` round-trips identically. The other actions are local
 * `db.vault.*` calls (not synced state). Note: the settings window is a
 * separate renderer process — actions here mutate the shared DB, but the
 * main window's vault store won't refresh until it re-queries (cross-window
 * vault-state sync is a follow-up).
 */
import { ref, computed, onMounted } from "vue";
import { Surface, Flex, Text, Input, Button } from "@notesnook-vue/ui-vue";
import { useSettingsStore } from "@/stores/settings";
import { useVaultStore } from "@/stores/vault";
import { desktop } from "@/platform/desktop-bridge";

const settings = useSettingsStore();
const vault = useVaultStore();

onMounted(() => {
  // The settings window is its own Pinia app — seed vault existence so the
  // section shows management (not "Create vault") when a vault already exists.
  void vault.refresh();
});

// --- create-vault form -----------------------------------------------------
const createPw = ref("");
const createPwConfirm = ref("");

// --- change-password form --------------------------------------------------
const changeOld = ref("");
const changeNew = ref("");
const changeNewConfirm = ref("");

// --- clear-vault form ------------------------------------------------------
const clearPw = ref("");

// --- delete-vault ----------------------------------------------------------
const deleteAllLockedNotes = ref(false);

/** Client-side validation message (mismatch / empty). Store/server errors land
 *  in `vault.lastError`; both are surfaced. */
const formError = ref<string | null>(null);
const error = computed(() => formError.value ?? vault.lastError);

/** Vault auto-lock options — upstream's exact ms values (`-1` = Never). */
const vaultLockOptions: { value: number; label: string }[] = [
  { value: 1000 * 60 * 1, label: "1 minute" },
  { value: 1000 * 60 * 5, label: "5 minutes" },
  { value: 1000 * 60 * 10, label: "10 minutes" },
  { value: 1000 * 60 * 15, label: "15 minutes" },
  { value: 1000 * 60 * 30, label: "30 minutes" },
  { value: 1000 * 60 * 45, label: "45 minutes" },
  { value: 1000 * 60 * 60, label: "1 hour" },
  { value: -1, label: "Never" }
];

/** Signal the main window that the shared DB changed from this (settings)
 *  renderer — core events are per-process, so the main window's vault store
 *  won't see a create/clear/delete otherwise. Best-effort (tests have no bridge). */
function signalDataChanged(): void {
  void desktop.window.notifyDataChanged.mutate().catch(() => {
    /* main unreachable (e.g. tests) — the action still succeeded */
  });
}

function pickVaultLock(e: Event): void {
  settings.setVaultLockAfter(Number((e.target as HTMLSelectElement).value));
}

function resetForms(): void {
  createPw.value = "";
  createPwConfirm.value = "";
  changeOld.value = "";
  changeNew.value = "";
  changeNewConfirm.value = "";
  clearPw.value = "";
  deleteAllLockedNotes.value = false;
  formError.value = null;
}

async function onCreate(): Promise<void> {
  formError.value = null;
  if (!createPw.value) {
    formError.value = "Enter a password.";
    return;
  }
  if (createPw.value.length < 4) {
    formError.value = "Password must be at least 4 characters.";
    return;
  }
  if (createPw.value !== createPwConfirm.value) {
    formError.value = "Passwords do not match.";
    return;
  }
  const ok = await vault.create(createPw.value);
  if (ok) {
    resetForms();
    signalDataChanged();
  }
}

async function onChangePassword(): Promise<void> {
  formError.value = null;
  if (!changeOld.value || !changeNew.value) {
    formError.value = "Enter the current and new password.";
    return;
  }
  if (changeNew.value !== changeNewConfirm.value) {
    formError.value = "New passwords do not match.";
    return;
  }
  const ok = await vault.changePassword(changeOld.value, changeNew.value);
  if (ok) resetForms();
}

async function onClear(): Promise<void> {
  formError.value = null;
  if (!clearPw.value) {
    formError.value = "Enter the vault password.";
    return;
  }
  if (!window.confirm("Clear the vault? All locked notes will be unlocked and moved back to All Notes.")) return;
  const ok = await vault.clear(clearPw.value);
  if (ok) {
    resetForms();
    signalDataChanged();
  }
}

async function onDelete(): Promise<void> {
  formError.value = null;
  const msg = deleteAllLockedNotes.value
    ? "Delete the vault AND all locked notes? This cannot be undone."
    : "Delete the vault? Locked notes will be kept (unlocked back to All Notes). This cannot be undone.";
  if (!window.confirm(msg)) return;
  await vault.deleteVault(deleteAllLockedNotes.value);
  resetForms();
  signalDataChanged();
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Text as="h2" variant="heading" size="md">Vault</Text>

      <!-- No vault: create ---------------------------------------------------->
      <template v-if="!vault.exists">
        <Text variant="body" size="sm" class="text-text-muted">
          Create an encrypted vault to lock sensitive notes behind a password.
        </Text>
        <Flex direction="column" :gap="2">
          <Input v-model="createPw" type="password" block placeholder="Password" autocomplete="new-password" />
          <Input
            v-model="createPwConfirm"
            type="password"
            block
            placeholder="Confirm password"
            autocomplete="new-password"
          />
          <Button variant="primary" :disabled="vault.busy" @click="onCreate">Create vault</Button>
        </Flex>
      </template>

      <!-- Vault exists: manage ------------------------------------------------>
      <template v-else>
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">Lock vault after</Text>
          <select
            :value="settings.vaultLockAfter"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickVaultLock"
          >
            <option v-for="o in vaultLockOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <Text variant="body" size="xs" class="text-text-muted"
            >Automatically locks the vault after a period of inactivity.</Text
          >
        </Flex>

        <!-- Change password -->
        <Flex direction="column" :gap="2">
          <Text variant="body" size="sm" class="text-text">Change password</Text>
          <Input v-model="changeOld" type="password" block placeholder="Current password" autocomplete="current-password" />
          <Input v-model="changeNew" type="password" block placeholder="New password" autocomplete="new-password" />
          <Input
            v-model="changeNewConfirm"
            type="password"
            block
            placeholder="Confirm new password"
            autocomplete="new-password"
          />
          <Button variant="secondary" :disabled="vault.busy" @click="onChangePassword">Change password</Button>
        </Flex>

        <!-- Clear vault -->
        <Flex direction="column" :gap="2">
          <Text variant="body" size="sm" class="text-text">Clear vault</Text>
          <Text variant="body" size="xs" class="text-text-muted"
            >Unlocks all locked notes and moves them back to All Notes. The vault remains.</Text
          >
          <Input v-model="clearPw" type="password" block placeholder="Vault password" autocomplete="current-password" />
          <Button variant="danger" :disabled="vault.busy" @click="onClear">Clear vault</Button>
        </Flex>

        <!-- Delete vault -->
        <Flex direction="column" :gap="2">
          <Text variant="body" size="sm" class="text-text">Delete vault</Text>
          <label class="flex items-center gap-2 text-xs text-text-muted">
            <input v-model="deleteAllLockedNotes" type="checkbox" class="accent-accent" />
            Also delete all locked notes
          </label>
          <Button variant="danger" :disabled="vault.busy" @click="onDelete">Delete vault</Button>
        </Flex>
      </template>

      <Text v-if="error" variant="body" size="xs" class="text-[var(--red-static)]">{{ error }}</Text>
    </Flex>
  </Surface>
</template>