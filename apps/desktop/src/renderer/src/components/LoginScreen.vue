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
const HOST_FIELDS: { key: keyof Hosts; label: string; placeholder: string }[] = [
  { key: "API_HOST", label: "Sync server URL", placeholder: "e.g. http://localhost:4326" },
  { key: "AUTH_HOST", label: "Auth server URL", placeholder: "e.g. http://localhost:5326" },
  { key: "SSE_HOST", label: "SSE server URL", placeholder: "e.g. http://localhost:7326" },
  { key: "MONOGRAPH_HOST", label: "Monograph server URL", placeholder: "e.g. http://localhost:6326" }
];

const busy = computed(
  () => auth.status === "logging-in" || auth.status === "unknown"
);
const showMfa = computed(() => auth.status === "mfa");
const mfaPrompt = computed(() => {
  const m = auth.pendingMfa?.method;
  if (m === "email") return "Enter the verification code sent to your email address.";
  if (m === "sms") return "Enter the verification code sent to your phone.";
  if (m === "app") return "Enter the code from your authenticator app.";
  return "Enter your verification code.";
});
const canResendCode = computed(() => {
  const m = auth.pendingMfa?.method;
  return m === "email" || m === "sms";
});
const secondaryMethodLabel = computed(() => {
  const s = auth.pendingMfa?.secondaryMethod;
  if (s === "email") return "Use email verification instead";
  if (s === "sms") return "Use SMS verification instead";
  if (s === "app") return "Use authenticator app instead";
  return "Use secondary method";
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
    localError.value = "Email and password are required.";
    return;
  }
  if (mode.value === "signup") {
    if (password.value !== confirmPassword.value) {
      localError.value = "Passwords do not match.";
      return;
    }
    if (password.value.length < 8) {
      localError.value = "Password must be at least 8 characters.";
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
    localError.value = "Enter your verification code.";
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
        localError.value = `${f.label} must be a valid http(s) URL.`;
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
          {{ showMfa ? "Two-factor verification" : mode === "signin" ? "Sign in to sync your notes" : "Create an account" }}
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
            {{ busy ? "Verifying…" : "Verify" }}
          </Button>

          <div class="flex items-center justify-between text-xs pt-1">
            <button
              v-if="canResendCode"
              type="button"
              class="text-accent hover:underline disabled:opacity-50 font-medium"
              :disabled="busy || resending"
              @click="resendCode"
            >
              {{ resending ? "Sending code…" : "Resend code" }}
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
              Sign in
            </button>
            <button
              type="button"
              class="flex-1 rounded px-3 py-1 transition-colors"
              :class="mode === 'signup' ? 'bg-accent text-accent-foreground' : 'text-text-muted hover:bg-hover'"
              @click="mode = 'signup'"
            >
              Sign up
            </button>
          </div>

          <Input
            v-model="email"
            type="email"
            block
            autocomplete="email"
            placeholder="you@example.com"
            :variant="formError ? 'error' : 'default'"
            :disabled="busy"
          />
          <Input
            v-model="password"
            type="password"
            block
            autocomplete="current-password"
            placeholder="Password"
            :variant="formError ? 'error' : 'default'"
            :disabled="busy"
          />
          <Input
            v-if="mode === 'signup'"
            v-model="confirmPassword"
            type="password"
            block
            autocomplete="new-password"
            placeholder="Confirm password"
            :variant="formError ? 'error' : 'default'"
            :disabled="busy"
          />

          <Text v-if="formError" variant="body" size="xs" class="text-[var(--red-static)]">{{ formError }}</Text>

          <Button variant="primary" block :disabled="busy" type="submit">
            {{ busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account" }}
          </Button>
          <Button variant="ghost" block :disabled="busy" type="button" @click="skip">
            Continue without account
          </Button>
        </form>

        <!-- Server selector -->
        <Flex direction="column" :gap="2" class="mt-2 border-t border-border pt-3">
          <Text variant="muted" size="xs" weight="medium">Server</Text>
          <label class="flex items-center gap-2 text-sm text-text">
            <input
              v-model="serverProfile"
              type="radio"
              value="notesnook"
              class="accent-accent"
            />
            Notesnook (default)
          </label>
          <label class="flex items-center gap-2 text-sm text-text">
            <input
              v-model="serverProfile"
              type="radio"
              value="custom"
              class="accent-accent"
            />
            Custom / Self-hosted
          </label>

          <Flex v-if="serverProfile === 'custom'" direction="column" :gap="2" class="mt-1">
            <label
              v-for="f in HOST_FIELDS"
              :key="f.key"
              class="flex flex-col gap-1"
            >
              <Text variant="muted" size="xs">{{ f.label }}</Text>
              <Input
                v-model="customHosts[f.key]"
                type="url"
                block
                size="sm"
                :placeholder="f.placeholder"
                :variant="formError && formError.includes(f.label) ? 'error' : 'default'"
              />
            </label>
            <Button variant="secondary" block size="sm" type="button" @click="applyServer">
              Apply &amp; restart
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
            Switch back to Notesnook servers
          </Button>
        </Flex>
      </Flex>
    </Surface>
  </div>
</template>