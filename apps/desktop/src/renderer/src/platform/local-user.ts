/*
Local-mode user + master key — gives the local (logged-out) context a real
`User` record + derived master key so `db.attachments` can encrypt/decrypt
attachments without a server login.

Why this exists: `@notesnook/core`'s `Attachments.save` calls `getAttachmentsKey`
→ `getMasterKey`, which returns `undefined` (and `_getEncryptionKey` then throws
"Failed to get user encryption key. Cannot cache attachments.") when there is
no `User` record / derived crypto key. Upstream only ever creates a `User` via
the server-mediated `signup`/`authenticatePassword` flow, so local mode (skipped
login) has neither — and drag-and-drop / paste of images into the editor is
backed by `db.attachments.save`, so it would silently fail in local mode.

`ensureLocalUser` synthesises a local `User` (sentinel email) + derives a master
key from a fixed password + a per-context random salt (stored on the `User`
record). The derived key is persisted in the OS keychain by `NNStorage`
(`deriveCryptoKey` → `keyStore.setValue("userEncryptionKey", …)`), the same
posture as the existing keychain-backed `databaseKey` — local security relies on
the OS keychain + local file access, not a user-typed password. The fixed
password is never stored; re-deriving with the stored salt + the same constant
reproduces the same key (so a cleared keychain entry can be recovered).

The sentinel `LOCAL_USER_EMAIL` lets the auth gate (`stores/auth.ts` `init()`)
recognise this synthesised user and stay in the logged-out state — so the login
screen / "Sign in" affordance / no-auto-sync behaviour of local mode is
unchanged while a real `User` record (for crypto) exists.
*/
import type { Database, User } from "@notesnook-vue/contracts";
import {
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionProvider
} from "@notesnook/core";

/** Sentinel email for the synthesised local user. The auth gate treats a user
 *  with this email as logged-out (local mode), so the login UI is unaffected. */
export const LOCAL_USER_EMAIL = "local@notesnook-vue.local";

/**
 * Fixed password used to derive the local master key. Never stored — only the
 * derived key is (in the OS keychain). A constant is acceptable here because
 * local-mode security already rests on the OS keychain + local file access
 * (same as the keychain-backed `databaseKey`), not a user-chosen password; the
 * per-context random salt (stored on the `User` record) keeps each context's
 * key distinct.
 */
const LOCAL_PASSWORD = "notesnook-vue-local-context-key";

/** A valid `User` for the local context: free / expired subscription, MFA off. */
export function buildLocalUser(salt: string): User {
  return {
    id: "local",
    email: LOCAL_USER_EMAIL,
    isEmailConfirmed: true,
    salt,
    mfa: {
      isEnabled: false,
      primaryMethod: "app",
      remainingValidCodes: 0
    },
    subscription: {
      appId: 0,
      cancelURL: null,
      expiry: 0,
      productId: null,
      provider: SubscriptionProvider.STREETWRITERS,
      start: 0,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.EXPIRED,
      updateURL: null,
      googlePurchaseToken: null
    }
  };
}

/**
 * Ensure the local context has a `User` record + a derived master key + a
 * pre-seeded `attachmentsKey` so `db.attachments` works without a server
 * login. Idempotent:
 *  - If no `User` exists, generate a salt (via `generateCryptoKey`, which returns
 *    a sodium-correct base64 salt), `setUser(buildLocalUser(salt))`.
 *  - If no crypto key is in the key store, (re)derive it from the fixed password
 *    + the user's stored salt. Re-deriving reproduces the same key, so this also
 *    recovers a cleared keychain entry.
 *  - If `attachmentsKey` is unset, generate a random attachment key, wrap it
 *    with the master key, and write it straight onto the `User` record via
 *    `setUser`. This mirrors what `signup` does, MINUS the server sync: core's
 *    `getAttachmentsKey` first-time path would otherwise call `updateUser` →
 *    `http.patch` (needs a token) + `fetchUser` (needs a server), both of which
 *    fail in local mode. With the wrapped key already on the record,
 *    `keyManager.get("attachmentsKey")` finds it locally and `unwrapKey`
 *    decrypts it — no network.
 *
 * Safe to call on every boot of the local context. No network — every step is
 * a local KV / keychain / crypto operation.
 */
export async function ensureLocalUser(db: Database): Promise<void> {
  let user = await db.user.getUser();
  if (!user) {
    // `generateCryptoKey` derives a key + a random base64 salt; we only need the
    // salt (the key is re-derived below into the key store so it is recoverable
    // from the stored salt + the fixed password).
    const seed = await db.storage().generateCryptoKey(LOCAL_PASSWORD);
    if (!seed.salt) throw new Error("Failed to generate local user salt.");
    user = buildLocalUser(seed.salt);
    await db.user.setUser(user);
  }
  if (!user) throw new Error("ensureLocalUser: user is undefined");

  const cryptoKey = await db.storage().getCryptoKey();
  if (!cryptoKey) {
    await db.storage().deriveCryptoKey({
      password: LOCAL_PASSWORD,
      salt: user.salt
    });
  }

  if (!user.attachmentsKey) {
    const masterKey = await db.user.getMasterKey();
    if (!masterKey) throw new Error("Failed to derive local master key.");
    const attachmentKey = await db.crypto().generateRandomKey();
    // `wrapKey` for a non-pair key is `storage.encrypt(wrappingKey,
    // JSON.stringify(key))`; replicate it directly to avoid the private
    // `keyManager` and the server-syncing `updateUser`.
    const wrapped = await db.storage().encrypt(
      masterKey,
      JSON.stringify(attachmentKey)
    );
    user = { ...user, attachmentsKey: wrapped };
    await db.user.setUser(user);
  }
}