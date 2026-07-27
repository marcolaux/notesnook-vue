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
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/settings";
import { useVaultStore } from "@/stores/vault";
import { desktop } from "@/platform/desktop-bridge";

const settings = useSettingsStore();
const vault = useVaultStore();
const { t } = useI18n();

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
const vaultLockOptions = computed<{ value: number; label: string }[]>(() => [
  { value: 1000 * 60 * 1, label: t("settings.vault.lock1m") },
  { value: 1000 * 60 * 5, label: t("settings.vault.lock5m") },
  { value: 1000 * 60 * 10, label: t("settings.vault.lock10m") },
  { value: 1000 * 60 * 15, label: t("settings.vault.lock15m") },
  { value: 1000 * 60 * 30, label: t("settings.vault.lock30m") },
  { value: 1000 * 60 * 45, label: t("settings.vault.lock45m") },
  { value: 1000 * 60 * 60, label: t("settings.vault.lock1h") },
  { value: -1, label: t("common.never") }
]);

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
    formError.value = t("settings.vault.errEnterPassword");
    return;
  }
  if (createPw.value.length < 4) {
    formError.value = t("settings.vault.errPasswordShort");
    return;
  }
  if (createPw.value !== createPwConfirm.value) {
    formError.value = t("settings.vault.errPasswordMismatch");
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
    formError.value = t("settings.vault.errEnterCurrentNew");
    return;
  }
  if (changeNew.value !== changeNewConfirm.value) {
    formError.value = t("settings.vault.errNewMismatch");
    return;
  }
  const ok = await vault.changePassword(changeOld.value, changeNew.value);
  if (ok) resetForms();
}

async function onClear(): Promise<void> {
  formError.value = null;
  if (!clearPw.value) {
    formError.value = t("settings.vault.errEnterVaultPassword");
    return;
  }
  if (!window.confirm(t("settings.vault.clearConfirm"))) return;
  const ok = await vault.clear(clearPw.value);
  if (ok) {
    resetForms();
    signalDataChanged();
  }
}

async function onDelete(): Promise<void> {
  formError.value = null;
  const msg = deleteAllLockedNotes.value
    ? t("settings.vault.deleteConfirmAll")
    : t("settings.vault.deleteConfirmKeep");
  if (!window.confirm(msg)) return;
  await vault.deleteVault(deleteAllLockedNotes.value);
  resetForms();
  signalDataChanged();
}
</script>

<template>
  <Surface class="rounded-xl border border-border p-5">
    <Flex direction="column" :gap="4">
      <Text as="h2" variant="heading" size="md">{{ t("settings.vault.title") }}</Text>

      <!-- No vault: create ---------------------------------------------------->
      <template v-if="!vault.exists">
        <Text variant="body" size="sm" class="text-text-muted">
          {{ t("settings.vault.createDesc") }}
        </Text>
        <Flex direction="column" :gap="2">
          <Input v-model="createPw" type="password" block :placeholder="t('settings.vault.password')" autocomplete="new-password" />
          <Input
            v-model="createPwConfirm"
            type="password"
            block
            :placeholder="t('settings.vault.confirmPassword')"
            autocomplete="new-password"
          />
          <Button variant="primary" :disabled="vault.busy" @click="onCreate">{{ t("settings.vault.createVault") }}</Button>
        </Flex>
      </template>

      <!-- Vault exists: manage ------------------------------------------------>
      <template v-else>
        <Flex direction="column" :gap="1">
          <Text variant="body" size="sm" class="text-text-muted">{{ t("settings.vault.lockVaultAfter") }}</Text>
          <select
            :value="settings.vaultLockAfter"
            class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="pickVaultLock"
          >
            <option v-for="o in vaultLockOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <Text variant="body" size="xs" class="text-text-muted"
            >{{ t("settings.vault.lockHint") }}</Text
          >
        </Flex>

        <!-- Change password -->
        <Flex direction="column" :gap="2">
          <Text variant="body" size="sm" class="text-text">{{ t("settings.vault.changePassword") }}</Text>
          <Input v-model="changeOld" type="password" block :placeholder="t('settings.vault.currentPassword')" autocomplete="current-password" />
          <Input v-model="changeNew" type="password" block :placeholder="t('settings.vault.newPassword')" autocomplete="new-password" />
          <Input
            v-model="changeNewConfirm"
            type="password"
            block
            :placeholder="t('settings.vault.confirmNewPassword')"
            autocomplete="new-password"
          />
          <Button variant="secondary" :disabled="vault.busy" @click="onChangePassword">{{ t("settings.vault.changePassword") }}</Button>
        </Flex>

        <!-- Clear vault -->
        <Flex direction="column" :gap="2">
          <Text variant="body" size="sm" class="text-text">{{ t("settings.vault.clearVault") }}</Text>
          <Text variant="body" size="xs" class="text-text-muted"
            >{{ t("settings.vault.clearVaultDesc") }}</Text
          >
          <Input v-model="clearPw" type="password" block :placeholder="t('settings.vault.vaultPassword')" autocomplete="current-password" />
          <Button variant="danger" :disabled="vault.busy" @click="onClear">{{ t("settings.vault.clearVault") }}</Button>
        </Flex>

        <!-- Delete vault -->
        <Flex direction="column" :gap="2">
          <Text variant="body" size="sm" class="text-text">{{ t("settings.vault.deleteVault") }}</Text>
          <label class="flex items-center gap-2 text-xs text-text-muted">
            <input v-model="deleteAllLockedNotes" type="checkbox" class="accent-accent" />
            {{ t("settings.vault.alsoDeleteLocked") }}
          </label>
          <Button variant="danger" :disabled="vault.busy" @click="onDelete">{{ t("settings.vault.deleteVault") }}</Button>
        </Flex>
      </template>

      <Text v-if="error" variant="body" size="xs" class="text-[var(--red-static)]">{{ error }}</Text>
    </Flex>
  </Surface>
</template>