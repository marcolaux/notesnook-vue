import { ISodium, base64_variants } from "./types-IekemUrg.js";

//#region src/node.d.ts
type Uint8ArrayOutputFormat = "uint8array";
type StringOutputFormat = "text" | "hex" | "base64";
type KeyType = "curve25519" | "ed25519" | "x25519";
type StateAddress = {
  name: string;
};
interface KeyPair {
  keyType: KeyType;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}
interface StringKeyPair {
  keyType: KeyType;
  privateKey: string;
  publicKey: string;
}
interface MessageTag {
  message: Uint8Array;
  tag: number;
}
interface StringMessageTag {
  message: string;
  tag: number;
}
declare function crypto_pwhash(keyLength: number, password: string | Uint8Array, salt: Uint8Array, opsLimit: number, memLimit: number, algorithm: number, outputFormat?: Uint8ArrayOutputFormat | null): Uint8Array;
declare function crypto_pwhash(keyLength: number, password: string | Uint8Array, salt: Uint8Array, opsLimit: number, memLimit: number, algorithm: number, outputFormat: StringOutputFormat): string;
declare function crypto_generichash(hash_length: number, message: string | Uint8Array, key?: string | Uint8Array | null, outputFormat?: Uint8ArrayOutputFormat | null): Uint8Array;
declare function crypto_generichash(hash_length: number, message: string | Uint8Array, key: string | Uint8Array | null, outputFormat: StringOutputFormat): string;
declare function crypto_aead_xchacha20poly1305_ietf_encrypt(message: string | Uint8Array, additional_data: string | Uint8Array | null, secret_nonce: string | Uint8Array | null, public_nonce: Uint8Array, key: Uint8Array, outputFormat?: Uint8ArrayOutputFormat | null): Uint8Array;
declare function crypto_aead_xchacha20poly1305_ietf_encrypt(message: string | Uint8Array, additional_data: string | Uint8Array | null, secret_nonce: string | Uint8Array | null, public_nonce: Uint8Array, key: Uint8Array, outputFormat: StringOutputFormat): string;
declare function crypto_secretstream_xchacha20poly1305_init_push(key: Uint8Array, outputFormat?: Uint8ArrayOutputFormat | null): {
  state: StateAddress;
  header: Uint8Array;
};
declare function crypto_secretstream_xchacha20poly1305_init_push(key: Uint8Array, outputFormat: StringOutputFormat): {
  state: StateAddress;
  header: string;
};
declare function crypto_secretstream_xchacha20poly1305_push(state_address: StateAddress, message_chunk: string | Uint8Array, ad: string | Uint8Array | null, tag: number, outputFormat?: Uint8ArrayOutputFormat | null): Uint8Array;
declare function crypto_secretstream_xchacha20poly1305_push(state_address: StateAddress, message_chunk: string | Uint8Array, ad: string | Uint8Array | null, tag: number, outputFormat: StringOutputFormat): string;
declare function crypto_aead_xchacha20poly1305_ietf_decrypt(secret_nonce: string | Uint8Array | null, ciphertext: string | Uint8Array, additional_data: string | Uint8Array | null, public_nonce: Uint8Array, key: Uint8Array, outputFormat?: Uint8ArrayOutputFormat | null): Uint8Array;
declare function crypto_aead_xchacha20poly1305_ietf_decrypt(secret_nonce: string | Uint8Array | null, ciphertext: string | Uint8Array, additional_data: string | Uint8Array | null, public_nonce: Uint8Array, key: Uint8Array, outputFormat: StringOutputFormat): string;
declare function crypto_secretstream_xchacha20poly1305_init_pull(header: Uint8Array, key: Uint8Array): StateAddress;
declare function crypto_secretstream_xchacha20poly1305_pull(state_address: StateAddress, cipher: string | Uint8Array, ad?: string | Uint8Array | null, outputFormat?: Uint8ArrayOutputFormat | null): MessageTag;
declare function crypto_secretstream_xchacha20poly1305_pull(state_address: StateAddress, cipher: string | Uint8Array, ad: string | Uint8Array | null, outputFormat: StringOutputFormat): StringMessageTag;
declare function randombytes_buf(length: number, outputFormat?: Uint8ArrayOutputFormat | null): Uint8Array;
declare function randombytes_buf(length: number, outputFormat: StringOutputFormat): string;
declare function from_base64(input: string, variant?: base64_variants): Uint8Array;
declare function to_base64(input: string | Uint8Array, variant?: base64_variants): string;
declare function from_hex(input: string): Uint8Array;
declare function to_string(input: Uint8Array): string;
declare class Sodium implements ISodium {
  initialize(): Promise<void>;
  get crypto_generichash(): typeof crypto_generichash;
  get crypto_pwhash(): typeof crypto_pwhash;
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
  get from_base64(): typeof from_base64;
  get to_base64(): typeof to_base64;
  get randombytes_buf(): typeof randombytes_buf;
  get to_string(): typeof to_string;
  get from_hex(): typeof from_hex;
  get crypto_aead_xchacha20poly1305_ietf_KEYBYTES(): number;
  get crypto_aead_xchacha20poly1305_ietf_encrypt(): typeof crypto_aead_xchacha20poly1305_ietf_encrypt;
  get crypto_aead_xchacha20poly1305_ietf_decrypt(): typeof crypto_aead_xchacha20poly1305_ietf_decrypt;
  get crypto_secretstream_xchacha20poly1305_init_push(): typeof crypto_secretstream_xchacha20poly1305_init_push;
  get crypto_secretstream_xchacha20poly1305_push(): typeof crypto_secretstream_xchacha20poly1305_push;
  get crypto_secretstream_xchacha20poly1305_init_pull(): typeof crypto_secretstream_xchacha20poly1305_init_pull;
  get crypto_secretstream_xchacha20poly1305_pull(): typeof crypto_secretstream_xchacha20poly1305_pull;
  get crypto_aead_xchacha20poly1305_ietf_NPUBBYTES(): number;
  get crypto_secretstream_xchacha20poly1305_TAG_FINAL(): number;
  get crypto_secretstream_xchacha20poly1305_TAG_MESSAGE(): number;
}
//#endregion
export { type ISodium, KeyPair, KeyType, MessageTag, Sodium, StateAddress, StringKeyPair, StringMessageTag, StringOutputFormat, Uint8ArrayOutputFormat, base64_variants };