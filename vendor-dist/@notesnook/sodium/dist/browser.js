const require_types = require('./types-D-1jAxbX.js');
let libsodium_wrappers_sumo = require("libsodium-wrappers-sumo");
libsodium_wrappers_sumo = require_types.__toESM(libsodium_wrappers_sumo);

//#region src/browser.ts
var Sodium = class {
	async initialize() {
		await libsodium_wrappers_sumo.default.ready;
	}
	get crypto_generichash() {
		return libsodium_wrappers_sumo.default.crypto_generichash;
	}
	get crypto_pwhash() {
		return libsodium_wrappers_sumo.default.crypto_pwhash;
	}
	get crypto_pwhash_ALG_ARGON2ID13() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_ALG_ARGON2ID13;
	}
	get crypto_pwhash_SALTBYTES() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_SALTBYTES;
	}
	get crypto_pwhash_ALG_ARGON2I13() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_ALG_ARGON2I13;
	}
	get crypto_pwhash_ALG_DEFAULT() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_ALG_DEFAULT;
	}
	get crypto_pwhash_OPSLIMIT_INTERACTIVE() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_OPSLIMIT_INTERACTIVE;
	}
	get crypto_pwhash_OPSLIMIT_MODERATE() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_OPSLIMIT_MODERATE;
	}
	get crypto_pwhash_OPSLIMIT_SENSITIVE() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_OPSLIMIT_SENSITIVE;
	}
	get crypto_pwhash_MEMLIMIT_INTERACTIVE() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_MEMLIMIT_INTERACTIVE;
	}
	get crypto_pwhash_MEMLIMIT_MODERATE() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_MEMLIMIT_MODERATE;
	}
	get crypto_pwhash_MEMLIMIT_SENSITIVE() {
		return libsodium_wrappers_sumo.default.crypto_pwhash_MEMLIMIT_SENSITIVE;
	}
	from_base64(input, variant) {
		return libsodium_wrappers_sumo.default.from_base64(input, variant ? convertVariant(variant) : void 0);
	}
	to_base64(input, variant) {
		return libsodium_wrappers_sumo.default.to_base64(input, variant ? convertVariant(variant) : void 0);
	}
	get randombytes_buf() {
		return libsodium_wrappers_sumo.default.randombytes_buf;
	}
	get to_string() {
		return libsodium_wrappers_sumo.default.to_string;
	}
	get from_hex() {
		return libsodium_wrappers_sumo.default.from_hex;
	}
	get crypto_aead_xchacha20poly1305_ietf_KEYBYTES() {
		return libsodium_wrappers_sumo.default.crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
	}
	get crypto_aead_xchacha20poly1305_ietf_encrypt() {
		return libsodium_wrappers_sumo.default.crypto_aead_xchacha20poly1305_ietf_encrypt;
	}
	get crypto_aead_xchacha20poly1305_ietf_decrypt() {
		return libsodium_wrappers_sumo.default.crypto_aead_xchacha20poly1305_ietf_decrypt;
	}
	get crypto_secretstream_xchacha20poly1305_init_push() {
		return libsodium_wrappers_sumo.default.crypto_secretstream_xchacha20poly1305_init_push;
	}
	get crypto_secretstream_xchacha20poly1305_push() {
		return libsodium_wrappers_sumo.default.crypto_secretstream_xchacha20poly1305_push;
	}
	get crypto_secretstream_xchacha20poly1305_init_pull() {
		return libsodium_wrappers_sumo.default.crypto_secretstream_xchacha20poly1305_init_pull;
	}
	get crypto_secretstream_xchacha20poly1305_pull() {
		return libsodium_wrappers_sumo.default.crypto_secretstream_xchacha20poly1305_pull;
	}
	get crypto_aead_xchacha20poly1305_ietf_NPUBBYTES() {
		return libsodium_wrappers_sumo.default.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
	}
	get crypto_secretstream_xchacha20poly1305_TAG_FINAL() {
		return libsodium_wrappers_sumo.default.crypto_secretstream_xchacha20poly1305_TAG_FINAL;
	}
	get crypto_secretstream_xchacha20poly1305_TAG_MESSAGE() {
		return libsodium_wrappers_sumo.default.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
	}
};
function convertVariant(variant) {
	switch (variant) {
		case require_types.base64_variants.ORIGINAL: return libsodium_wrappers_sumo.default.base64_variants.ORIGINAL;
		case require_types.base64_variants.ORIGINAL_NO_PADDING: return libsodium_wrappers_sumo.default.base64_variants.ORIGINAL_NO_PADDING;
		case require_types.base64_variants.URLSAFE: return libsodium_wrappers_sumo.default.base64_variants.URLSAFE;
		case require_types.base64_variants.URLSAFE_NO_PADDING: return libsodium_wrappers_sumo.default.base64_variants.URLSAFE_NO_PADDING;
	}
}

//#endregion
exports.Sodium = Sodium;
exports.base64_variants = require_types.base64_variants;