<script setup lang="ts">
/**
 * LoginScreen — the auth entry surface. Sign in / sign up against the
 * configured server, with MFA code step, and a server selector that points the
 * app at the default Notesnook servers or a self-hosted bag. The configurable
 * set is the SAME four hosts upstream's web Settings → Servers exposes
 * (`HostIds`: API / AUTH / SSE / MONOGRAPH) — the remaining components
 * (SUBSCRIPTIONS, ISSUES, NOTESNOOK) stay at their defaults, exactly as in
 * upstream. There is no single discovery URL yet (upstream issue #9670).
 *
 * Talks to `useAuthStore` directly; `App.vue` reacts to `auth.showShell` and
 * swaps this screen out for the notes shell. Changing the server persists the
 * new config and reloads so `bootstrap()` re-initialises the Database against
 * the new hosts (the switch only runs while logged-out, so no session is lost).
 */
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Surface, Flex, Text, Input, Button } from "@notesnook-vue/ui-vue";
import { useAuthStore } from "@/stores/auth";
import {
  readServerConfig,
  resolveHosts,
  writeServerConfig,
  defaultHosts,
  type Hosts,
  type ServerProfile
} from "@/platform/server-config";

const auth = useAuthStore();
const { t } = useI18n();

type Mode = "signin" | "signup";
const mode = ref<Mode>("signin");

const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const mfaCode = ref("");

// --- Server config (local copy; applied via reload) ---
const initialConfig = readServerConfig();
const serverProfile = ref<ServerProfile>(initialConfig.profile);
const customHosts = ref<Hosts>(
  initialConfig.profile === "custom" ? { ...initialConfig.hosts } : defaultHosts()
);

// The four hosts upstream's web Settings → Servers exposes (`HostIds`):
// API (sync), AUTH, SSE, MONOGRAPH. SUBSCRIPTIONS / ISSUES / NOTESNOOK are NOT
// user-configurable upstream — they stay at their defaults (merged in
// `resolveHosts`). Labels + example ports mirror the upstream web app.
// `labelKey`/`placeholderKey` resolve via `t()` so the labels localize; the
// validation-error match in the template compares against `t(labelKey)`.
const HOST_FIELDS: { key: keyof Hosts; labelKey: string; placeholderKey: string }[] = [
  { key: "API_HOST", labelKey: "login.syncServerUrl", placeholderKey: "login.syncServerExample" },
  { key: "AUTH_HOST", labelKey: "login.authServerUrl", placeholderKey: "login.authServerExample" },
  { key: "SSE_HOST", labelKey: "login.sseServerUrl", placeholderKey: "login.sseServerExample" },
  { key: "MONOGRAPH_HOST", labelKey: "login.monographServerUrl", placeholderKey: "login.monographServerExample" }
];

const busy = computed(
  () => auth.status === "logging-in" || auth.status === "unknown"
);
const showMfa = computed(() => auth.status === "mfa");
const mfaPrompt = computed(() => {
  const m = auth.pendingMfa?.method;
  if (m === "email") return t("login.mfaEmail");
  if (m === "sms") return t("login.mfaSms");
  if (m === "app") return t("login.mfaApp");
  return t("login.mfaDefault");
});
const canResendCode = computed(() => {
  const m = auth.pendingMfa?.method;
  return m === "email" || m === "sms";
});
const secondaryMethodLabel = computed(() => {
  const s = auth.pendingMfa?.secondaryMethod;
  if (s === "email") return t("login.useEmailInstead");
  if (s === "sms") return t("login.useSmsInstead");
  if (s === "app") return t("login.useAppInstead");
  return t("login.useSecondary");
});

const localError = ref("");
const formError = computed(() => localError.value || auth.error);
const resending = ref(false);

// Clear the MFA code when leaving the MFA step.
watch(showMfa, (v) => {
  if (!v) {
    mfaCode.value = "";
    resending.value = false;
  }
});

function submit(): void {
  localError.value = "";
  if (!email.value.trim() || !password.value) {
    localError.value = t("login.emailPasswordRequired");
    return;
  }
  if (mode.value === "signup") {
    if (password.value !== confirmPassword.value) {
      localError.value = t("login.passwordsDoNotMatch");
      return;
    }
    if (password.value.length < 8) {
      localError.value = t("login.passwordTooShort");
      return;
    }
    void auth.signup(email.value.trim(), password.value);
  } else {
    void auth.login(email.value.trim(), password.value);
  }
}

function submitMfa(): void {
  localError.value = "";
  if (!mfaCode.value.trim()) {
    localError.value = t("login.enterCode");
    return;
  }
  void auth.submitMfa(mfaCode.value.trim());
}

async function resendCode(): Promise<void> {
  resending.value = true;
  localError.value = "";
  try {
    await auth.resendMfaCode();
  } finally {
    resending.value = false;
  }
}

async function switchMethod(): Promise<void> {
  const secondary = auth.pendingMfa?.secondaryMethod;
  if (!secondary) return;
  localError.value = "";
  resending.value = true;
  try {
    await auth.switchMfaMethod(secondary);
  } finally {
    resending.value = false;
  }
}

function applyServer(): void {
  localError.value = "";
  if (serverProfile.value === "custom") {
    // Partial bag, like upstream: start from the defaults and override only the
    // fields the user filled (and validated). An empty field keeps the default
    // for that component — so a self-hoster only sets what they actually run.
    const merged = defaultHosts();
    for (const f of HOST_FIELDS) {
      const raw = (customHosts.value[f.key] ?? "").trim();
      if (raw === "") continue;
      try {
        const u = new URL(raw);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
        merged[f.key] = raw;
      } catch {
        localError.value = t("login.invalidUrl", { field: t(f.labelKey) });
        return;
      }
    }
    writeServerConfig({ profile: "custom", hosts: merged });
  } else {
    writeServerConfig({ profile: "notesnook" });
  }
  location.reload();
}

function skip(): void {
  auth.skipLogin();
}
</script>

<template>
  <div class="grid min-h-0 flex-1 place-items-center overflow-auto p-6">
    <Surface class="w-full max-w-md rounded-xl border border-glass-border p-6" :opacity="true" :blur="true">
      <Flex direction="column" :gap="4">
        <Text as="h1" variant="heading" size="xl" weight="bold">Notesnook</Text>
        <Text variant="muted" size="sm">
          {{ showMfa ? t('login.twoFactor') : mode === "signin" ? t('login.signinToSync') : t('login.createAccountHeading') }}
        </Text>

        <!-- MFA step -->
        <form v-if="showMfa" class="flex flex-col gap-3" @submit.prevent="submitMfa">
          <Text variant="body" size="sm">
            {{ mfaPrompt }}
          </Text>
          <Input
            v-model="mfaCode"
            type="text"
            block
            autocomplete="one-time-code"
            placeholder="123456"
            :variant="formError ? 'error' : 'default'"
            :disabled="busy || resending"
          />
          <Text v-if="auth.resendStatus" variant="body" size="xs" class="text-emerald-500 font-medium font-sans">
            {{ auth.resendStatus }}
          </Text>
          <Text v-if="formError" variant="body" size="xs" class="text-[var(--red-static)]">{{ formError }}</Text>
          <Button variant="primary" block :disabled="busy || resending" type="submit">
            {{ busy ? t('login.verifying') : t('login.verify') }}
          </Button>

          <div class="flex items-center justify-between text-xs pt-1">
            <button
              v-if="canResendCode"
              type="button"
              class="text-accent hover:underline disabled:opacity-50 font-medium"
              :disabled="busy || resending"
              @click="resendCode"
            >
              {{ resending ? t('login.sendingCode') : t('login.resendCode') }}
            </button>
            <button
              v-if="auth.pendingMfa?.secondaryMethod"
              type="button"
              class="text-text-muted hover:text-text hover:underline ml-auto"
              :disabled="busy || resending"
              @click="switchMethod"
            >
              {{ secondaryMethodLabel }}
            </button>
          </div>
        </form>

        <!-- Sign in / Sign up -->
        <form v-else class="flex flex-col gap-3" @submit.prevent="submit">
          <div class="flex rounded-md border border-border p-0.5 text-sm">
            <button
              type="button"
              class="flex-1 rounded px-3 py-1 transition-colors"
              :class="mode === 'signin' ? 'bg-accent text-accent-foreground' : 'text-text-muted hover:bg-hover'"
              @click="mode = 'signin'"
            >
              {{ t('login.signinTab') }}
            </button>
            <button
              type="button"
              class="flex-1 rounded px-3 py-1 transition-colors"
              :class="mode === 'signup' ? 'bg-accent text-accent-foreground' : 'text-text-muted hover:bg-hover'"
              @click="mode = 'signup'"
            >
              {{ t('login.signupTab') }}
            </button>
          </div>

          <Input
            v-model="email"
            type="email"
            block
            autocomplete="email"
            :placeholder="t('login.emailPlaceholder')"
            :variant="formError ? 'error' : 'default'"
            :disabled="busy"
          />
          <Input
            v-model="password"
            type="password"
            block
            autocomplete="current-password"
            :placeholder="t('login.passwordPlaceholder')"
            :variant="formError ? 'error' : 'default'"
            :disabled="busy"
          />
          <Input
            v-if="mode === 'signup'"
            v-model="confirmPassword"
            type="password"
            block
            autocomplete="new-password"
            :placeholder="t('login.confirmPasswordPlaceholder')"
            :variant="formError ? 'error' : 'default'"
            :disabled="busy"
          />

          <Text v-if="formError" variant="body" size="xs" class="text-[var(--red-static)]">{{ formError }}</Text>

          <Button variant="primary" block :disabled="busy" type="submit">
            {{ busy ? t('login.pleaseWait') : mode === "signin" ? t('login.signinButton') : t('login.createAccountButton') }}
          </Button>
          <Button variant="ghost" block :disabled="busy" type="button" @click="skip">
            {{ t('login.continueWithoutAccount') }}
          </Button>
        </form>

        <!-- Server selector -->
        <Flex direction="column" :gap="2" class="mt-2 border-t border-border pt-3">
          <Text variant="muted" size="xs" weight="medium">{{ t('login.server') }}</Text>
          <label class="flex items-center gap-2 text-sm text-text">
            <input
              v-model="serverProfile"
              type="radio"
              value="notesnook"
              class="accent-accent"
            />
            {{ t('login.serverNotesnook') }}
          </label>
          <label class="flex items-center gap-2 text-sm text-text">
            <input
              v-model="serverProfile"
              type="radio"
              value="custom"
              class="accent-accent"
            />
            {{ t('login.serverCustom') }}
          </label>

          <Flex v-if="serverProfile === 'custom'" direction="column" :gap="2" class="mt-1">
            <label
              v-for="f in HOST_FIELDS"
              :key="f.key"
              class="flex flex-col gap-1"
            >
              <Text variant="muted" size="xs">{{ t(f.labelKey) }}</Text>
              <Input
                v-model="customHosts[f.key]"
                type="url"
                block
                size="sm"
                :placeholder="t(f.placeholderKey)"
                :variant="formError && formError.includes(t(f.labelKey)) ? 'error' : 'default'"
              />
            </label>
            <Button variant="secondary" block size="sm" type="button" @click="applyServer">
              {{ t('login.applyAndRestart') }}
            </Button>
            <Text v-if="formError" variant="body" size="xs" class="text-[var(--red-static)]">{{ formError }}</Text>
          </Flex>
          <Button
            v-else-if="initialConfig.profile === 'custom'"
            variant="ghost"
            block
            size="sm"
            type="button"
            @click="applyServer"
          >
            {{ t('login.switchBack') }}
          </Button>
        </Flex>
      </Flex>
    </Surface>
  </div>
</template>