import { Cipher } from "@notesnook/crypto";
import { StorageAccessor } from "../interfaces.js";
export type CryptoAccessor = () => Crypto;
export declare class Crypto {
    private readonly storage;
    constructor(storage: StorageAccessor);
    generateRandomKey(): Promise<import("@notesnook/crypto").SerializedKey>;
    generatePGPKeyPair(): Promise<import("@notesnook/crypto").SerializedKeyPair>;
}
export declare function isCipher(item: any): item is Cipher<"base64">;
