import { Cipher, SerializedKey, SerializedKeyPair } from "@notesnook/crypto";
import Database from ".";
declare const KEY_INFO: {
    readonly inboxKeys: {
        readonly type: "asymmetric";
    };
    readonly attachmentsKey: {
        readonly type: "symmetric";
    };
    readonly monographPasswordsKey: {
        readonly type: "symmetric";
    };
    readonly dataEncryptionKey: {
        readonly type: "symmetric";
    };
    readonly legacyDataEncryptionKey: {
        readonly type: "symmetric";
    };
};
export type KeyId = keyof typeof KEY_INFO;
type WrapKeyReturnType<T extends SerializedKeyPair | SerializedKey> = T extends SerializedKeyPair ? {
    public: string;
    private: Cipher<"base64">;
} : Cipher<"base64">;
type WrappedKey = Cipher<"base64"> | {
    public: string;
    private: Cipher<"base64">;
};
export type UnwrapKeyReturnType<T extends WrappedKey> = T extends {
    public: string;
    private: Cipher<"base64">;
} ? SerializedKeyPair : SerializedKey;
export type KeyTypeFromId<TId extends KeyId> = (typeof KEY_INFO)[TId]["type"] extends "symmetric" ? Cipher<"base64"> : {
    public: string;
    private: Cipher<"base64">;
};
export declare class KeyManager {
    private readonly db;
    private cache;
    constructor(db: Database);
    clearCache(): void;
    get<TId extends KeyId>(id: TId, options?: {
        useCache?: boolean;
        refetchUser?: boolean;
    }): Promise<KeyTypeFromId<TId> | undefined>;
    unwrapKey<T extends WrappedKey>(key: T, wrappingKey: SerializedKey): Promise<UnwrapKeyReturnType<T>>;
    wrapKey<T extends SerializedKey | SerializedKeyPair>(key: T, wrappingKey: SerializedKey): Promise<WrapKeyReturnType<T>>;
    rewrapKey<T extends WrappedKey>(key: T, oldWrappingKey: SerializedKey, newWrappingKey: SerializedKey): Promise<WrapKeyReturnType<UnwrapKeyReturnType<T>>>;
}
export {};
