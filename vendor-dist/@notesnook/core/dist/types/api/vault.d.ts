import { Cipher } from "@notesnook/crypto";
import Database from "./index.js";
import { Note, NoteContent } from "../types.js";
export declare const VAULT_ERRORS: {
    noVault: string;
    vaultLocked: string;
    wrongPassword: string;
};
export default class Vault {
    private readonly db;
    private vaultPassword?;
    private erasureTimeout;
    private key;
    private get password();
    private set password(value);
    private startEraser;
    constructor(db: Database);
    get unlocked(): boolean;
    create(password: string): Promise<boolean>;
    lock(): Promise<boolean>;
    unlock(password: string): Promise<boolean>;
    changePassword(oldPassword: string, newPassword: string): Promise<void>;
    clear(password: string): Promise<void>;
    /**
     *
     * There's an unintentional and unrelated bug where multiple vaults
     * can be created.
     * So when user triggers delete, we should delete all vaults.
     */
    delete(deleteAllLockedNotes?: boolean): Promise<void>;
    /**
     * Locks (add to vault) a note
     */
    add(noteId: string): Promise<void>;
    /**
     * Permanently unlocks (remove from vault) a note
     */
    remove(noteId: string, password: string): Promise<void>;
    /**
     * Temporarily unlock (open) a note
     */
    open(noteId: string, password?: string): Promise<(Note & {
        content?: NoteContent<false>;
    }) | undefined>;
    /**
     * Saves a note in the vault
     */
    save(note: {
        content?: NoteContent<false>;
        sessionId?: string;
        id: string;
    }): Promise<string | undefined>;
    exists(vaultKey?: Cipher<"base64">): Promise<boolean>;
    private getVaultPassword;
    private encryptContent;
    decryptContent(encryptedContent: NoteContent<true>, password?: string): Promise<NoteContent<false>>;
    private lockNote;
    private unlockNote;
    getKey(): Promise<Cipher<"base64"> | undefined>;
    setKey(vaultKey: Cipher<"base64">): Promise<void>;
}
