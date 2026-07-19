const require_types = require('./types-D-1jAxbX.js');
let sodium_native = require("sodium-native");
sodium_native = require_types.__toESM(sodium_native);
let node_buffer = require("node:buffer");
node_buffer = require_types.__toESM(node_buffer);

//#region src/node.ts
function crypto_pwhash(keyLength, password, salt, opsLimit, memLimit, algorithm, outputFormat) {
	return wrap(keyLength, (output) => (0, sodium_native.crypto_pwhash)(output, toBuffer(password), toBuffer(salt), opsLimit, memLimit, algorithm), outputFormat);
}
function crypto_generichash(hash_length, message, key, outputFormat) {
	return wrap(hash_length, (output) => {
		if (key) (0, sodium_native.crypto_generichash)(output, toBuffer(message), toBuffer(key));
		else (0, sodium_native.crypto_generichash)(output, toBuffer(message));
	}, outputFormat);
}
function crypto_aead_xchacha20poly1305_ietf_encrypt(message, additional_data, secret_nonce, public_nonce, key, outputFormat) {
	const m = toBuffer(message);
	return wrap(m.byteLength + sodium_native.crypto_aead_xchacha20poly1305_ietf_ABYTES, (output) => (0, sodium_native.crypto_aead_xchacha20poly1305_ietf_encrypt)(output, m, toBuffer(additional_data) || null, null, toBuffer(public_nonce), toBuffer(key)), outputFormat);
}
function crypto_secretstream_xchacha20poly1305_init_push(key, outputFormat) {
	const state = node_buffer.Buffer.alloc(sodium_native.crypto_secretstream_xchacha20poly1305_STATEBYTES);
	return {
		state,
		header: wrap(sodium_native.crypto_secretstream_xchacha20poly1305_HEADERBYTES, (header) => (0, sodium_native.crypto_secretstream_xchacha20poly1305_init_push)(state, header, toBuffer(key)), outputFormat)
	};
}
function crypto_secretstream_xchacha20poly1305_push(state_address, message_chunk, ad, tag, outputFormat) {
	const message = toBuffer(message_chunk);
	return wrap(message.byteLength + sodium_native.crypto_secretstream_xchacha20poly1305_ABYTES, (cipher) => (0, sodium_native.crypto_secretstream_xchacha20poly1305_push)(state_address, cipher, message, toBuffer(ad) || null, tag), outputFormat);
}
function crypto_aead_xchacha20poly1305_ietf_decrypt(_secret_nonce, ciphertext, additional_data, public_nonce, key, outputFormat) {
	const cipher = toBuffer(ciphertext);
	return wrap(cipher.byteLength - sodium_native.crypto_aead_xchacha20poly1305_ietf_ABYTES, (message) => (0, sodium_native.crypto_aead_xchacha20poly1305_ietf_decrypt)(message, null, cipher, toBuffer(additional_data) || null, toBuffer(public_nonce), toBuffer(key)), outputFormat);
}
function crypto_secretstream_xchacha20poly1305_init_pull(header, key) {
	const state = node_buffer.Buffer.alloc(sodium_native.crypto_secretstream_xchacha20poly1305_STATEBYTES);
	(0, sodium_native.crypto_secretstream_xchacha20poly1305_init_pull)(state, toBuffer(header), toBuffer(key));
	return state;
}
function crypto_secretstream_xchacha20poly1305_pull(state_address, ciphertext, ad, outputFormat) {
	const tag = node_buffer.Buffer.alloc(sodium_native.crypto_secretstream_xchacha20poly1305_TAGBYTES);
	const cipher = toBuffer(ciphertext);
	return {
		message: wrap(cipher.byteLength - sodium_native.crypto_secretstream_xchacha20poly1305_ABYTES, (message) => (0, sodium_native.crypto_secretstream_xchacha20poly1305_pull)(state_address, message, tag, cipher, toBuffer(ad) || null), outputFormat),
		tag: tag.readUInt8()
	};
}
function randombytes_buf(length, outputFormat) {
	return wrap(length, (output) => (0, sodium_native.randombytes_buf)(output), outputFormat);
}
function from_base64(input, variant) {
	return new Uint8Array(node_buffer.Buffer.from(variant === require_types.base64_variants.URLSAFE_NO_PADDING || variant === require_types.base64_variants.ORIGINAL_NO_PADDING ? appendPadding(input) : input, variant === require_types.base64_variants.URLSAFE || variant === require_types.base64_variants.URLSAFE_NO_PADDING ? "base64url" : "base64"));
}
function to_base64(input, variant = require_types.base64_variants.URLSAFE_NO_PADDING) {
	const base64 = toBuffer(input).toString(variant === require_types.base64_variants.URLSAFE || variant === require_types.base64_variants.URLSAFE_NO_PADDING ? "base64url" : "base64");
	return variant === require_types.base64_variants.URLSAFE_NO_PADDING || variant === require_types.base64_variants.ORIGINAL_NO_PADDING ? trimPadding(base64) : variant === require_types.base64_variants.URLSAFE ? appendPadding(base64) : base64;
}
function from_hex(input) {
	return new Uint8Array(node_buffer.Buffer.from(input, "hex"));
}
function to_string(input) {
	return node_buffer.Buffer.from(input, input.byteOffset, input.byteLength).toString("utf-8");
}
function toBuffer(input) {
	if (input instanceof Uint8Array) return node_buffer.Buffer.from(input.buffer, input.byteOffset, input.byteLength);
	else if (typeof input === "undefined" || input === null) return;
	else return node_buffer.Buffer.from(input, "utf8");
}
function wrap(length, action, outputFormat) {
	const output = node_buffer.Buffer.alloc(length);
	action(output);
	if (!outputFormat || outputFormat === "uint8array") return new Uint8Array(output);
	const string = output.toString(outputFormat === "text" ? "utf8" : outputFormat === "base64" ? "base64url" : "hex");
	(0, sodium_native.sodium_memzero)(output);
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
		return crypto_generichash;
	}
	get crypto_pwhash() {
		return crypto_pwhash;
	}
	get crypto_pwhash_ALG_ARGON2ID13() {
		return sodium_native.crypto_pwhash_ALG_ARGON2ID13;
	}
	get crypto_pwhash_SALTBYTES() {
		return sodium_native.crypto_pwhash_SALTBYTES;
	}
	get crypto_pwhash_ALG_ARGON2I13() {
		return sodium_native.crypto_pwhash_ALG_ARGON2I13;
	}
	get crypto_pwhash_ALG_DEFAULT() {
		return sodium_native.crypto_pwhash_ALG_DEFAULT;
	}
	get crypto_pwhash_OPSLIMIT_INTERACTIVE() {
		return sodium_native.crypto_pwhash_OPSLIMIT_INTERACTIVE;
	}
	get crypto_pwhash_OPSLIMIT_MODERATE() {
		return sodium_native.crypto_pwhash_OPSLIMIT_MODERATE;
	}
	get crypto_pwhash_OPSLIMIT_SENSITIVE() {
		return sodium_native.crypto_pwhash_OPSLIMIT_SENSITIVE;
	}
	get crypto_pwhash_MEMLIMIT_INTERACTIVE() {
		return sodium_native.crypto_pwhash_MEMLIMIT_INTERACTIVE;
	}
	get crypto_pwhash_MEMLIMIT_MODERATE() {
		return sodium_native.crypto_pwhash_MEMLIMIT_MODERATE;
	}
	get crypto_pwhash_MEMLIMIT_SENSITIVE() {
		return sodium_native.crypto_pwhash_MEMLIMIT_SENSITIVE;
	}
	get from_base64() {
		return from_base64;
	}
	get to_base64() {
		return to_base64;
	}
	get randombytes_buf() {
		return randombytes_buf;
	}
	get to_string() {
		return to_string;
	}
	get from_hex() {
		return from_hex;
	}
	get crypto_aead_xchacha20poly1305_ietf_KEYBYTES() {
		return sodium_native.crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
	}
	get crypto_aead_xchacha20poly1305_ietf_encrypt() {
		return crypto_aead_xchacha20poly1305_ietf_encrypt;
	}
	get crypto_aead_xchacha20poly1305_ietf_decrypt() {
		return crypto_aead_xchacha20poly1305_ietf_decrypt;
	}
	get crypto_secretstream_xchacha20poly1305_init_push() {
		return crypto_secretstream_xchacha20poly1305_init_push;
	}
	get crypto_secretstream_xchacha20poly1305_push() {
		return crypto_secretstream_xchacha20poly1305_push;
	}
	get crypto_secretstream_xchacha20poly1305_init_pull() {
		return crypto_secretstream_xchacha20poly1305_init_pull;
	}
	get crypto_secretstream_xchacha20poly1305_pull() {
		return crypto_secretstream_xchacha20poly1305_pull;
	}
	get crypto_aead_xchacha20poly1305_ietf_NPUBBYTES() {
		return sodium_native.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
	}
	get crypto_secretstream_xchacha20poly1305_TAG_FINAL() {
		return sodium_native.crypto_secretstream_xchacha20poly1305_TAG_FINAL;
	}
	get crypto_secretstream_xchacha20poly1305_TAG_MESSAGE() {
		return sodium_native.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
	}
};

//#endregion
exports.Sodium = Sodium;
exports.base64_variants = require_types.base64_variants;