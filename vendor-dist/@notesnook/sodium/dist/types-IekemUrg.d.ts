import sodium from "libsodium-wrappers-sumo";

//#region src/types.d.ts
declare enum base64_variants {
  ORIGINAL = 1,
  ORIGINAL_NO_PADDING = 3,
  URLSAFE = 5,
  URLSAFE_NO_PADDING = 7,
}
interface ISodium {
  initialize(): Promise<void>;
  get crypto_generichash(): typeof sodium.crypto_generichash;
  get crypto_pwhash(): typeof sodium.crypto_pwhash;
  get crypto_pwhash_ALG_ARGON2ID13(): typeof sodium.crypto_pwhash_ALG_ARGON2ID13;
  get crypto_pwhash_SALTBYTES(): typeof sodium.crypto_pwhash_SALTBYTES;
  get crypto_pwhash_ALG_ARGON2I13(): typeof sodium.crypto_pwhash_ALG_ARGON2I13;
  get crypto_pwhash_ALG_DEFAULT(): typeof sodium.crypto_pwhash_ALG_DEFAULT;
  get crypto_pwhash_OPSLIMIT_INTERACTIVE(): typeof sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE;
  get crypto_pwhash_OPSLIMIT_MODERATE(): typeof sodium.crypto_pwhash_OPSLIMIT_MODERATE;
  get crypto_pwhash_OPSLIMIT_SENSITIVE(): typeof sodium.crypto_pwhash_OPSLIMIT_SENSITIVE;
  get crypto_pwhash_MEMLIMIT_INTERACTIVE(): typeof sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE;
  get crypto_pwhash_MEMLIMIT_MODERATE(): typeof sodium.crypto_pwhash_MEMLIMIT_MODERATE;
  get crypto_pwhash_MEMLIMIT_SENSITIVE(): typeof sodium.crypto_pwhash_MEMLIMIT_SENSITIVE;
  from_base64(input: string, variant?: base64_variants): Uint8Array;
  to_base64(input: string | Uint8Array, variant?: base64_variants): string;
  get randombytes_buf(): typeof sodium.randombytes_buf;
  get to_string(): typeof sodium.to_string;
  get from_hex(): typeof sodium.from_hex;
  get crypto_aead_xchacha20poly1305_ietf_KEYBYTES(): typeof sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
  get crypto_aead_xchacha20poly1305_ietf_encrypt(): typeof sodium.crypto_aead_xchacha20poly1305_ietf_encrypt;
  get crypto_aead_xchacha20poly1305_ietf_decrypt(): typeof sodium.crypto_aead_xchacha20poly1305_ietf_decrypt;
  get crypto_secretstream_xchacha20poly1305_init_push(): typeof sodium.crypto_secretstream_xchacha20poly1305_init_push;
  get crypto_secretstream_xchacha20poly1305_push(): typeof sodium.crypto_secretstream_xchacha20poly1305_push;
  get crypto_secretstream_xchacha20poly1305_init_pull(): typeof sodium.crypto_secretstream_xchacha20poly1305_init_pull;
  get crypto_secretstream_xchacha20poly1305_pull(): typeof sodium.crypto_secretstream_xchacha20poly1305_pull;
  get crypto_aead_xchacha20poly1305_ietf_NPUBBYTES(): typeof sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  get crypto_secretstream_xchacha20poly1305_TAG_FINAL(): typeof sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL;
  get crypto_secretstream_xchacha20poly1305_TAG_MESSAGE(): typeof sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
}
//#endregion
export { ISodium, base64_variants };