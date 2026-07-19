
//#region src/keyutils.ts
let base64_variants = /* @__PURE__ */ function(base64_variants$1) {
	base64_variants$1[base64_variants$1["ORIGINAL"] = 1] = "ORIGINAL";
	base64_variants$1[base64_variants$1["ORIGINAL_NO_PADDING"] = 3] = "ORIGINAL_NO_PADDING";
	base64_variants$1[base64_variants$1["URLSAFE"] = 5] = "URLSAFE";
	base64_variants$1[base64_variants$1["URLSAFE_NO_PADDING"] = 7] = "URLSAFE_NO_PADDING";
	return base64_variants$1;
}({});
var KeyUtils = class {
	static deriveKey(sodium, password, salt) {
		let saltBytes;
		if (!salt) saltBytes = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
		else saltBytes = sodium.from_base64(salt);
		if (!saltBytes) throw new Error("Could not generate bytes from the given salt.");
		return {
			key: sodium.crypto_pwhash(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES, password, saltBytes, 3, 1024 * 1024 * 8, sodium.crypto_pwhash_ALG_ARGON2I13),
			salt: typeof salt === "string" ? salt : sodium.to_base64(saltBytes)
		};
	}
	static deriveKeyPair(sodium) {
		const keypair = sodium.crypto_box_keypair();
		return {
			publicKey: keypair.publicKey,
			privateKey: keypair.privateKey
		};
	}
	static exportKey(sodium, password, salt) {
		const { key, salt: keySalt } = this.deriveKey(sodium, password, salt);
		return {
			key: sodium.to_base64(key),
			salt: keySalt
		};
	}
	static exportKeyPair(sodium) {
		const { publicKey, privateKey } = this.deriveKeyPair(sodium);
		return {
			publicKey: sodium.to_base64(publicKey),
			privateKey: sodium.to_base64(privateKey)
		};
	}
	/**
	* Takes in either a password or a serialized encryption key
	* and spits out a key that can be directly used for encryption/decryption.
	* @param input
	*/
	static transform(sodium, input) {
		if ("password" in input && !!input.password) {
			const { password, salt } = input;
			return this.deriveKey(sodium, password, salt);
		} else if ("key" in input && !!input.salt && !!input.key) return {
			key: sodium.from_base64(input.key),
			salt: input.salt
		};
		throw new Error("Invalid input.");
	}
};

//#endregion
//#region src/decryption.ts
var Decryption = class {
	static transformInput(sodium, cipherData) {
		let input = null;
		if (typeof cipherData.cipher === "string" && cipherData.format === "base64") input = sodium.from_base64(cipherData.cipher, base64_variants.URLSAFE_NO_PADDING);
		else if (typeof cipherData.cipher === "string" && cipherData.format === "hex") input = sodium.from_hex(cipherData.cipher);
		else if (cipherData.cipher instanceof Uint8Array) input = cipherData.cipher;
		if (!input) throw new Error("Data cannot be null.");
		return input;
	}
	static decrypt(sodium, key, cipherData, outputFormat = "text") {
		if (!key.salt && cipherData.salt) key.salt = cipherData.salt;
		const encryptionKey = KeyUtils.transform(sodium, key);
		const input = this.transformInput(sodium, cipherData);
		const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, input, null, sodium.from_base64(cipherData.iv), encryptionKey.key);
		return outputFormat === "base64" ? sodium.to_base64(plaintext, base64_variants.ORIGINAL) : outputFormat === "text" ? sodium.to_string(plaintext) : plaintext;
	}
	static createStream(sodium, header, key) {
		const { key: _key } = KeyUtils.transform(sodium, key);
		const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(sodium.from_base64(header), _key);
		return new TransformStream({
			start() {},
			transform(chunk, controller) {
				const { message, tag } = sodium.crypto_secretstream_xchacha20poly1305_pull(state, chunk, null);
				if (!message) throw new Error("Could not decrypt chunk.");
				controller.enqueue(message);
				if (tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) controller.terminate();
			}
		});
	}
};

//#endregion
//#region src/encryption.ts
const encoder = new TextEncoder();
var Encryption = class {
	static transformInput(sodium, input, format) {
		let data = null;
		if (typeof input === "string" && format === "base64") data = sodium.from_base64(input, base64_variants.ORIGINAL);
		else if (typeof input === "string") data = encoder.encode(input);
		else if (input instanceof Uint8Array) data = input;
		if (!data) throw new Error("Data cannot be null.");
		return data;
	}
	static encrypt(sodium, key, input, format, outputFormat = "uint8array") {
		const encryptionKey = KeyUtils.transform(sodium, key);
		const data = this.transformInput(sodium, input, format);
		const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
		const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(data, null, null, nonce, encryptionKey.key);
		let output = cipher;
		if (outputFormat === "base64") output = sodium.to_base64(cipher, base64_variants.URLSAFE_NO_PADDING);
		const iv = sodium.to_base64(nonce);
		return {
			format: outputFormat,
			alg: getAlgorithm(base64_variants.URLSAFE_NO_PADDING),
			cipher: output,
			iv,
			salt: encryptionKey.salt,
			length: data.length
		};
	}
	static createStream(sodium, key) {
		const { key: _key } = KeyUtils.transform(sodium, key);
		const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(_key, "base64");
		return {
			iv: header,
			stream: new TransformStream({
				start() {},
				transform(chunk, controller) {
					controller.enqueue(sodium.crypto_secretstream_xchacha20poly1305_push(state, chunk.data, null, chunk.final ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE));
					if (chunk.final) controller.terminate();
				}
			})
		};
	}
};
function getAlgorithm(base64Variant) {
	return `xcha-argon2i13-${base64Variant}`;
}

//#endregion
//#region src/password.ts
var Password = class {
	static hash(sodium, password, salt) {
		const saltBytes = sodium.crypto_generichash(sodium.crypto_pwhash_SALTBYTES, salt);
		return sodium.crypto_pwhash(32, password, saltBytes, 3, 1024 * 1024 * 64, sodium.crypto_pwhash_ALG_ARGON2ID13, "base64");
	}
};

//#endregion
//#region src/index.ts
var NNCrypto = class {
	constructor() {
		this.isReady = false;
	}
	async init() {
		if (this.isReady) return;
		this.sodium = new (await (import("@notesnook/sodium"))).Sodium();
		await this.sodium.initialize();
		this.isReady = true;
	}
	async encrypt(key, input, format, outputFormat = "uint8array") {
		await this.init();
		return Encryption.encrypt(this.sodium, key, input, format, outputFormat);
	}
	async encryptMulti(key, items, format, outputFormat = "uint8array") {
		await this.init();
		return items.map((data) => Encryption.encrypt(this.sodium, key, data, format, outputFormat));
	}
	async decrypt(key, cipherData, outputFormat = "text") {
		await this.init();
		return Decryption.decrypt(this.sodium, key, cipherData, outputFormat);
	}
	async decryptMulti(key, items, outputFormat = "text") {
		await this.init();
		const decryptedItems = [];
		for (const cipherData of items) decryptedItems.push(Decryption.decrypt(this.sodium, key, cipherData, outputFormat));
		return decryptedItems;
	}
	async hash(password, salt) {
		await this.init();
		return Password.hash(this.sodium, password, salt);
	}
	async deriveKey(password, salt) {
		await this.init();
		return KeyUtils.deriveKey(this.sodium, password, salt);
	}
	async deriveKeyPair() {
		await this.init();
		return KeyUtils.deriveKeyPair(this.sodium);
	}
	async exportKey(password, salt) {
		await this.init();
		return KeyUtils.exportKey(this.sodium, password, salt);
	}
	async exportKeyPair() {
		await this.init();
		return KeyUtils.exportKeyPair(this.sodium);
	}
	async createEncryptionStream(key) {
		await this.init();
		return Encryption.createStream(this.sodium, key);
	}
	async createDecryptionStream(key, iv) {
		await this.init();
		return Decryption.createStream(this.sodium, iv, key);
	}
};

//#endregion
exports.Decryption = Decryption;
exports.NNCrypto = NNCrypto;