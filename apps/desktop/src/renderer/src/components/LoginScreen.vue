<script setup lang="ts">
/**
 * LoginScreen — the auth entry surface. Sign in / sign up against the
 * configured server, with MFA code step, and a server selector that points the
 * app at the default Notesnook servers or a self-hosted bag (five per-component
 * host fields, mirroring upstream Settings → Servers — there is no single
 * discovery URL yet).
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

const HOST_FIELDS: { key: keyof Hosts; label: string; placeholder: string }[] = [
  { key: "API_HOST", label: "API / Sync server", placeholder: "https://api.example.com" },
  { key: "AUTH_HOST", label: "Auth server", placeholder: "https://auth.example.com" },
  { key: "SSE_HOST", label: "Events (SSE) server", placeholder: "https://events.example.com" },
  { key: "SUBSCRIPTIONS_HOST", label: "Subscriptions server", placeholder: "https://subscriptions.example.com" },
  { key: "ISSUES_HOST", label: "Issues server", placeholder: "https://issues.example.com" }
];

const busy = computed(
  () => auth.status === "logging-in" || auth.status === "unknown"
);
const showMfa = computed(() => auth.status === "mfa");
const mfaMethodLabel = computed(() => {
  const m = auth.pendingMfa?.method;
  if (m === "app") return "authenticator app";
  return m ?? "MFA";
});

const localError = ref("");
const formError = computed(() => localError.value || auth.error);

// Clear the MFA code when leaving the MFA step.
watch(showMfa, (v) => {
  if (!v) mfaCode.value = "";
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

function applyServer(): void {
  localError.value = "";
  if (serverProfile.value === "custom") {
    for (const f of HOST_FIELDS) {
      const v = customHosts.value[f.key];
      try {
        const u = new URL(v.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
      } catch {
        localError.value = `${f.label} must be a valid http(s) URL.`;
        return;
      }
    }
    writeServerConfig({ profile: "custom", hosts: { ...customHosts.value } });
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
    <Surface class="w-full max-w-md rounded-xl border border-white/10 p-6" :opacity="true" :blur="true">
      <Flex direction="column" :gap="4">
        <Text as="h1" variant="heading" size="xl" weight="bold">Notesnook</Text>
        <Text variant="muted" size="sm">
          {{ showMfa ? "Two-factor verification" : mode === "signin" ? "Sign in to sync your notes" : "Create an account" }}
        </Text>

        <!-- MFA step -->
        <form v-if="showMfa" class="flex flex-col gap-3" @submit.prevent="submitMfa">
          <Text variant="body" size="sm">
            Enter the code from your {{ mfaMethodLabel }}.
          </Text>
          <Input
            v-model="mfaCode"
            type="text"
            block
            autocomplete="one-time-code"
            placeholder="123456"
            :variant="formError ? 'error' : 'default'"
            :disabled="busy"
          />
          <Text v-if="formError" variant="body" size="xs" class="text-[var(--red-static)]">{{ formError }}</Text>
          <Button variant="primary" block :disabled="busy" type="submit">
            {{ busy ? "Verifying…" : "Verify" }}
          </Button>
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