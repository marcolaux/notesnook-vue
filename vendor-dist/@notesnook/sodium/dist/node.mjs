import { base64_variants } from "./types-BP7u6NgT.mjs";
import { crypto_aead_xchacha20poly1305_ietf_ABYTES, crypto_aead_xchacha20poly1305_ietf_KEYBYTES, crypto_aead_xchacha20poly1305_ietf_NPUBBYTES, crypto_aead_xchacha20poly1305_ietf_decrypt, crypto_aead_xchacha20poly1305_ietf_encrypt, crypto_generichash, crypto_pwhash, crypto_pwhash_ALG_ARGON2I13, crypto_pwhash_ALG_ARGON2ID13, crypto_pwhash_ALG_DEFAULT, crypto_pwhash_MEMLIMIT_INTERACTIVE, crypto_pwhash_MEMLIMIT_MODERATE, crypto_pwhash_MEMLIMIT_SENSITIVE, crypto_pwhash_OPSLIMIT_INTERACTIVE, crypto_pwhash_OPSLIMIT_MODERATE, crypto_pwhash_OPSLIMIT_SENSITIVE, crypto_pwhash_SALTBYTES, crypto_secretstream_xchacha20poly1305_ABYTES, crypto_secretstream_xchacha20poly1305_HEADERBYTES, crypto_secretstream_xchacha20poly1305_STATEBYTES, crypto_secretstream_xchacha20poly1305_TAGBYTES, crypto_secretstream_xchacha20poly1305_TAG_FINAL, crypto_secretstream_xchacha20poly1305_TAG_MESSAGE, crypto_secretstream_xchacha20poly1305_init_pull, crypto_secretstream_xchacha20poly1305_init_push, crypto_secretstream_xchacha20poly1305_pull, crypto_secretstream_xchacha20poly1305_push, randombytes_buf, sodium_memzero } from "sodium-native";
import { Buffer } from "node:buffer";

//#region src/node.ts
function crypto_pwhash$1(keyLength, password, salt, opsLimit, memLimit, algorithm, outputFormat) {
	return wrap(keyLength, (output) => crypto_pwhash(output, toBuffer(password), toBuffer(salt), opsLimit, memLimit, algorithm), outputFormat);
}
function crypto_generichash$1(hash_length, message, key, outputFormat) {
	return wrap(hash_length, (output) => {
		if (key) crypto_generichash(output, toBuffer(message), toBuffer(key));
		else crypto_generichash(output, toBuffer(message));
	}, outputFormat);
}
function crypto_aead_xchacha20poly1305_ietf_encrypt$1(message, additional_data, secret_nonce, public_nonce, key, outputFormat) {
	const m = toBuffer(message);
	return wrap(m.byteLength + crypto_aead_xchacha20poly1305_ietf_ABYTES, (output) => crypto_aead_xchacha20poly1305_ietf_encrypt(output, m, toBuffer(additional_data) || null, null, toBuffer(public_nonce), toBuffer(key)), outputFormat);
}
function crypto_secretstream_xchacha20poly1305_init_push$1(key, outputFormat) {
	const state = Buffer.alloc(crypto_secretstream_xchacha20poly1305_STATEBYTES);
	return {
		state,
		header: wrap(crypto_secretstream_xchacha20poly1305_HEADERBYTES, (header) => crypto_secretstream_xchacha20poly1305_init_push(state, header, toBuffer(key)), outputFormat)
	};
}
function crypto_secretstream_xchacha20poly1305_push$1(state_address, message_chunk, ad, tag, outputFormat) {
	const message = toBuffer(message_chunk);
	return wrap(message.byteLength + crypto_secretstream_xchacha20poly1305_ABYTES, (cipher) => crypto_secretstream_xchacha20poly1305_push(state_address, cipher, message, toBuffer(ad) || null, tag), outputFormat);
}
function crypto_aead_xchacha20poly1305_ietf_decrypt$1(_secret_nonce, ciphertext, additional_data, public_nonce, key, outputFormat) {
	const cipher = toBuffer(ciphertext);
	return wrap(cipher.byteLength - crypto_aead_xchacha20poly1305_ietf_ABYTES, (message) => crypto_aead_xchacha20poly1305_ietf_decrypt(message, null, cipher, toBuffer(additional_data) || null, toBuffer(public_nonce), toBuffer(key)), outputFormat);
}
function crypto_secretstream_xchacha20poly1305_init_pull$1(header, key) {
	const state = Buffer.alloc(crypto_secretstream_xchacha20poly1305_STATEBYTES);
	crypto_secretstream_xchacha20poly1305_init_pull(state, toBuffer(header), toBuffer(key));
	return state;
}
function crypto_secretstream_xchacha20poly1305_pull$1(state_address, ciphertext, ad, outputFormat) {
	const tag = Buffer.alloc(crypto_secretstream_xchacha20poly1305_TAGBYTES);
	const cipher = toBuffer(ciphertext);
	return {
		message: wrap(cipher.byteLength - crypto_secretstream_xchacha20poly1305_ABYTES, (message) => crypto_secretstream_xchacha20poly1305_pull(state_address, message, tag, cipher, toBuffer(ad) || null), outputFormat),
		tag: tag.readUInt8()
	};
}
function randombytes_buf$1(length, outputFormat) {
	return wrap(length, (output) => randombytes_buf(output), outputFormat);
}
function from_base64(input, variant) {
	return new Uint8Array(Buffer.from(variant === base64_variants.URLSAFE_NO_PADDING || variant === base64_variants.ORIGINAL_NO_PADDING ? appendPadding(input) : input, variant === base64_variants.URLSAFE || variant === base64_variants.URLSAFE_NO_PADDING ? "base64url" : "base64"));
}
function to_base64(input, variant = base64_variants.URLSAFE_NO_PADDING) {
	const base64 = toBuffer(input).toString(variant === base64_variants.URLSAFE || variant === base64_variants.URLSAFE_NO_PADDING ? "base64url" : "base64");
	return variant === base64_variants.URLSAFE_NO_PADDING || variant === base64_variants.ORIGINAL_NO_PADDING ? trimPadding(base64) : variant === base64_variants.URLSAFE ? appendPadding(base64) : base64;
}
function from_hex(input) {
	return new Uint8Array(Buffer.from(input, "hex"));
}
function to_string(input) {
	return Buffer.from(input, input.byteOffset, input.byteLength).toString("utf-8");
}
function toBuffer(input) {
	if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
	else if (typeof input === "undefined" || input === null) return;
	else return Buffer.from(input, "utf8");
}
function wrap(length, action, outputFormat) {
	const output = Buffer.alloc(length);
	action(output);
	if (!outputFormat || outputFormat === "uint8array") return new Uint8Array(output);
	const string = output.toString(outputFormat === "text" ? "utf8" : outputFormat === "base64" ? "base64url" : "hex");
	sodium_memzero(output);
	return string;
}
function appendPadding(str) {
	str = str || "";
	if (str.length % 4) str += "=".repeat(4 - str.length % 4);
	return str;
}
function trimPadding(str) {
	while (str.length && str[str.length - 1] === "=") str = str.slice(0, -1);
	return str;
}
var Sodium = class {
	async initialize() {}
	get crypto_generichash() {
		return crypto_generichash$1;
	}
	get crypto_pwhash() {
		return crypto_pwhash$1;
	}
	get crypto_pwhash_ALG_ARGON2ID13() {
		return crypto_pwhash_ALG_ARGON2ID13;
	}
	get crypto_pwhash_SALTBYTES() {
		return crypto_pwhash_SALTBYTES;
	}
	get crypto_pwhash_ALG_ARGON2I13() {
		return crypto_pwhash_ALG_ARGON2I13;
	}
	get crypto_pwhash_ALG_DEFAULT() {
		return crypto_pwhash_ALG_DEFAULT;
	}
	get crypto_pwhash_OPSLIMIT_INTERACTIVE() {
		return crypto_pwhash_OPSLIMIT_INTERACTIVE;
	}
	get crypto_pwhash_OPSLIMIT_MODERATE() {
		return crypto_pwhash_OPSLIMIT_MODERATE;
	}
	get crypto_pwhash_OPSLIMIT_SENSITIVE() {
		return crypto_pwhash_OPSLIMIT_SENSITIVE;
	}
	get crypto_pwhash_MEMLIMIT_INTERACTIVE() {
		return crypto_pwhash_MEMLIMIT_INTERACTIVE;
	}
	get crypto_pwhash_MEMLIMIT_MODERATE() {
		return crypto_pwhash_MEMLIMIT_MODERATE;
	}
	get crypto_pwhash_MEMLIMIT_SENSITIVE() {
		return crypto_pwhash_MEMLIMIT_SENSITIVE;
	}
	get from_base64() {
		return from_base64;
	}
	get to_base64() {
		return to_base64;
	}
	get randombytes_buf() {
		return randombytes_buf$1;
	}
	get to_string() {
		return to_string;
	}
	get from_hex() {
		return from_hex;
	}
	get crypto_aead_xchacha20poly1305_ietf_KEYBYTES() {
		return crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
	}
	get crypto_aead_xchacha20poly1305_ietf_encrypt() {
		return crypto_aead_xchacha20poly1305_ietf_encrypt$1;
	}
	get crypto_aead_xchacha20poly1305_ietf_decrypt() {
		return crypto_aead_xchacha20poly1305_ietf_decrypt$1;
	}
	get crypto_secretstream_xchacha20poly1305_init_push() {
		return crypto_secretstream_xchacha20poly1305_init_push$1;
	}
	get crypto_secretstream_xchacha20poly1305_push() {
		return crypto_secretstream_xchacha20poly1305_push$1;
	}
	get crypto_secretstream_xchacha20poly1305_init_pull() {
		return crypto_secretstream_xchacha20poly1305_init_pull$1;
	}
	get crypto_secretstream_xchacha20poly1305_pull() {
		return crypto_secretstream_xchacha20poly1305_pull$1;
	}
	get crypto_aead_xchacha20poly1305_ietf_NPUBBYTES() {
		return crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
	}
	get crypto_secretstream_xchacha20poly1305_TAG_FINAL() {
		return crypto_secretstream_xchacha20poly1305_TAG_FINAL;
	}
	get crypto_secretstream_xchacha20poly1305_TAG_MESSAGE() {
		return crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
	}
};

//#endregion
export { Sodium, base64_variants };