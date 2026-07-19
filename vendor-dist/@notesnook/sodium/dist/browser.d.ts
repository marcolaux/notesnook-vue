import { ISodium, base64_variants } from "./types-IekemUrg.js";
import sodium, { MessageTag, StateAddress, StringMessageTag, StringOutputFormat, Uint8ArrayOutputFormat } from "libsodium-wrappers-sumo";

//#region src/browser.d.ts
declare class Sodium implements ISodium {
  initialize(): Promise<void>;
  get crypto_generichash(): typeof sodium.crypto_generichash;
  get crypto_pwhash(): typeof sodium.crypto_pwhash;
  get crypto_pwhash_ALG_ARGON2ID13(): number;
  get crypto_pwhash_SALTBYTES(): number;
  get crypto_pwhash_ALG_ARGON2I13(): number;
  get crypto_pwhash_ALG_DEFAULT(): number;
  get crypto_pwhash_OPSLIMIT_INTERACTIVE(): number;
  get crypto_pwhash_OPSLIMIT_MODERATE(): number;
  get crypto_pwhash_OPSLIMIT_SENSITIVE(): number;
  get crypto_pwhash_MEMLIMIT_INTERACTIVE(): number;
  get crypto_pwhash_MEMLIMIT_MODERATE(): number;
  get crypto_pwhash_MEMLIMIT_SENSITIVE(): number;
  from_base64(input: string, variant?: base64_variants): Uint8Array<ArrayBufferLike>;
  to_base64(input: string | Uint8Array, variant?: base64_variants): string;
  get randombytes_buf(): typeof sodium.randombytes_buf;
  get to_string(): typeof sodium.to_string;
  get from_hex(): typeof sodium.from_hex;
  get crypto_aead_xchacha20poly1305_ietf_KEYBYTES(): number;
  get crypto_aead_xchacha20poly1305_ietf_encrypt(): typeof sodium.crypto_aead_xchacha20poly1305_ietf_encrypt;
  get crypto_aead_xchacha20poly1305_ietf_decrypt(): typeof sodium.crypto_aead_xchacha20poly1305_ietf_decrypt;
  get crypto_secretstream_xchacha20poly1305_init_push(): typeof sodium.crypto_secretstream_xchacha20poly1305_init_push;
  get crypto_secretstream_xchacha20poly1305_push(): typeof sodium.crypto_secretstream_xchacha20poly1305_push;
  get crypto_secretstream_xchacha20poly1305_init_pull(): typeof sodium.crypto_secretstream_xchacha20poly1305_init_pull;
  get crypto_secretstream_xchacha20poly1305_pull(): typeof sodium.crypto_secretstream_xchacha20poly1305_pull;
  get crypto_aead_xchacha20poly1305_ietf_NPUBBYTES(): number;
  get crypto_secretstream_xchacha20poly1305_TAG_FINAL(): number;
  get crypto_secretstream_xchacha20poly1305_TAG_MESSAGE(): number;
}
//#endregion
export { ISodium, type MessageTag, Sodium, type StateAddress, type StringMessageTag, type StringOutputFormat, type Uint8ArrayOutputFormat, base64_variants };