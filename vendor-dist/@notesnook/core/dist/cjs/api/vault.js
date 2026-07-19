"use strict";
/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VAULT_ERRORS = void 0;
const common_js_1 = require("../common.js");
const crypto_js_1 = require("../utils/crypto.js");
const logger_js_1 = require("../logger.js");
exports.VAULT_ERRORS = {
    noVault: "ERR_NO_VAULT",
    vaultLocked: "ERR_VAULT_LOCKED",
    wrongPassword: "ERR_WRONG_PASSWORD"
};
class Vault {
    get password() {
        return this.vaultPassword;
    }
    set password(value) {
        if (this.vaultPassword !== value) {
            this.vaultPassword = value;
            if (value)
                this.db.eventManager.publish(common_js_1.EVENTS.vaultUnlocked);
        }
        if (value) {
            this.startEraser();
        }
    }
    startEraser() {
        clearTimeout(this.erasureTimeout);
        const lockAfter = this.db.settings.getVaultLockAfter();
        if (lockAfter < 0)
            return;
        this.erasureTimeout = setTimeout(() => {
            this.lock();
            this.db.eventManager.publish(common_js_1.EVENTS.vaultAutoLocked);
        }, lockAfter);
    }
    constructor(db) {
        this.db = db;
        this.erasureTimeout = 0;
        this.key = "svvaads1212#2123";
        this.password = undefined;
        db.eventManager.subscribe(common_js_1.EVENTS.userLoggedOut, () => {
            this.password = undefined;
        });
    }
    get unlocked() {
        return !!this.vaultPassword;
    }
    create(password) {
        return __awaiter(this, void 0, void 0, function* () {
            const vaultKey = yield this.getKey();
            if (!vaultKey || !(0, crypto_js_1.isCipher)(vaultKey)) {
                const encryptedData = yield this.db
                    .storage()
                    .encrypt({ password }, this.key);
                yield this.setKey(encryptedData);
                this.password = password;
            }
            return true;
        });
    }
    lock() {
        return __awaiter(this, void 0, void 0, function* () {
            this.password = undefined;
            this.db.eventManager.publish(common_js_1.EVENTS.vaultLocked);
            return true;
        });
    }
    unlock(password) {
        return __awaiter(this, void 0, void 0, function* () {
            const vaultKey = yield this.getKey();
            if (!vaultKey || !(yield this.exists(vaultKey)))
                throw new Error(exports.VAULT_ERRORS.noVault);
            try {
                yield this.db.storage().decrypt({ password }, vaultKey);
            }
            catch (e) {
                throw new Error(exports.VAULT_ERRORS.wrongPassword);
            }
            this.password = password;
            return true;
        });
    }
    changePassword(oldPassword, newPassword) {
        return __awaiter(this, void 0, void 0, function* () {
            const vault = yield this.db.vaults.default();
            if (!vault)
                throw new Error(exports.VAULT_ERRORS.noVault);
            if (yield this.unlock(oldPassword)) {
                const relations = yield this.db.relations.from(vault, "note").get();
                for (const { toId: noteId } of relations) {
                    const content = yield this.db.content.findByNoteId(noteId);
                    if (!content || !content.locked) {
                        yield this.db.relations.unlink(vault, { id: noteId, type: "note" });
                        continue;
                    }
                    try {
                        const decryptedContent = yield this.decryptContent(content, oldPassword);
                        yield this.encryptContent(decryptedContent, noteId, newPassword, `${Date.now()}`);
                    }
                    catch (e) {
                        logger_js_1.logger.error(e, `Could not decrypt content of note ${noteId}`);
                        throw new Error(`Could not decrypt content of note ${noteId}. Error: ${e.message}`);
                    }
                }
                yield this.db.vaults.add({
                    id: vault.id,
                    key: yield this.db
                        .storage()
                        .encrypt({ password: newPassword }, this.key)
                });
            }
        });
    }
    clear(password) {
        return __awaiter(this, void 0, void 0, function* () {
            const vault = yield this.db.vaults.default();
            if (!vault)
                return;
            if (yield this.unlock(password)) {
                const relations = yield this.db.relations.from(vault, "note").get();
                for (const { toId: noteId } of relations) {
                    yield this.unlockNote(noteId, password, true);
                    yield this.db.relations.unlink(vault, { id: noteId, type: "note" });
                }
            }
        });
    }
    delete() {
        return __awaiter(this, arguments, void 0, function* (deleteAllLockedNotes = false) {
            const vault = yield this.db.vaults.default();
            if (!vault)
                return;
            if (deleteAllLockedNotes) {
                const relations = yield this.db.relations.from(vault, "note").get();
                const lockedIds = relations.map((r) => r.toId);
                yield this.db.notes.remove(...lockedIds);
            }
            yield this.db.vaults.remove(vault.id);
            this.password = undefined;
        });
    }
    /**
     * Locks (add to vault) a note
     */
    add(noteId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.lockNote({ id: noteId }, yield this.getVaultPassword());
            yield this.db.noteHistory.clearSessions(noteId);
        });
    }
    /**
     * Permanently unlocks (remove from vault) a note
     */
    remove(noteId, password) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.unlockNote(noteId, password, true);
            yield this.db.relations.to({ id: noteId, type: "note" }, "vault").unlink();
        });
    }
    /**
     * Temporarily unlock (open) a note
     */
    open(noteId, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const note = yield this.db.notes.note(noteId);
            if (!note)
                return;
            const content = yield this.unlockNote(noteId, password || this.password, false);
            if (password) {
                try {
                    yield this.unlock(password);
                }
                catch (_a) { }
            }
            return Object.assign(Object.assign({}, note), { content });
        });
    }
    /**
     * Saves a note in the vault
     */
    save(note) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!note)
                return;
            // roll over erase timer
            this.startEraser();
            return yield this.lockNote(note, yield this.getVaultPassword());
        });
    }
    exists(vaultKey) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!vaultKey)
                vaultKey = yield this.getKey();
            return !!vaultKey && (0, crypto_js_1.isCipher)(vaultKey);
        });
    }
    // Private & internal methods
    getVaultPassword() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(yield this.exists())) {
                throw new Error(exports.VAULT_ERRORS.noVault);
            }
            if (!this.password || !this.password.length) {
                throw new Error(exports.VAULT_ERRORS.vaultLocked);
            }
            return this.password;
        });
    }
    encryptContent(content, noteId, password, sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const encryptedContent = yield this.db
                .storage()
                .encrypt({ password }, JSON.stringify(content.data));
            return yield this.db.content.add({
                noteId,
                sessionId,
                data: encryptedContent,
                dateEdited: Date.now(),
                type: content.type
            });
        });
    }
    decryptContent(encryptedContent, password) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!password)
                password = yield this.getVaultPassword();
            if (!(0, crypto_js_1.isCipher)(encryptedContent.data))
                return encryptedContent;
            const decryptedContent = yield this.db
                .storage()
                .decrypt({ password }, encryptedContent.data);
            return {
                type: encryptedContent.type,
                data: JSON.parse(decryptedContent)
            };
        });
    }
    lockNote(item, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const vault = yield this.db.vaults.default();
            if (!vault)
                throw new Error(exports.VAULT_ERRORS.noVault);
            const { id, content, sessionId } = item;
            let { type, data } = content || {};
            const locked = yield this.db.relations.from(vault, "note").has(id);
            // Case: when note is being newly locked
            if (!locked && (!data || !type)) {
                const rawContent = yield this.db.content.findByNoteId(id);
                if (rawContent === null || rawContent === void 0 ? void 0 : rawContent.locked) {
                    yield this.db.relations.add(vault, {
                        id,
                        type: "note"
                    });
                    return id;
                }
                // NOTE:
                // At this point, the note already has all the attachments extracted
                // so we should just encrypt it as normal.
                data = (rawContent === null || rawContent === void 0 ? void 0 : rawContent.data) || "<p></p>";
                type = (rawContent === null || rawContent === void 0 ? void 0 : rawContent.type) || "tiptap";
            }
            else if (data && type) {
                data = yield this.db.content.postProcess({
                    data,
                    type,
                    noteId: id
                });
            }
            yield this.db.notes.add({
                id,
                headline: "",
                dateEdited: Date.now(),
                contentId: data && type
                    ? yield this.encryptContent({ data, type }, id, password, sessionId)
                    : undefined
            });
            yield this.db.relations.add(vault, {
                id,
                type: "note"
            });
            return id;
        });
    }
    unlockNote(noteId_1, password_1) {
        return __awaiter(this, arguments, void 0, function* (noteId, password, perm = false) {
            const content = yield this.db.content.findByNoteId(noteId);
            if (!content || !content.locked) {
                yield this.db.relations
                    .to({ id: noteId, type: "note" }, "vault")
                    .unlink();
                return content ? { data: content.data, type: content.type } : undefined;
            }
            const decryptedContent = yield this.decryptContent(content, password);
            if (yield this.db.content.preProcess(decryptedContent)) {
                if (!password)
                    password = yield this.getVaultPassword();
                yield this.encryptContent(decryptedContent, noteId, password, `${Date.now}`);
            }
            if (perm) {
                yield this.db.relations
                    .to({ id: noteId, type: "note" }, "vault")
                    .unlink();
                yield this.db.notes.add({
                    id: noteId,
                    contentId: content.id,
                    content: decryptedContent
                });
                // await this.db.content.add({ id: note.contentId, data: content });
                return;
            }
            return decryptedContent;
        });
    }
    getKey() {
        return __awaiter(this, void 0, void 0, function* () {
            const vault = yield this.db.vaults.default();
            return vault === null || vault === void 0 ? void 0 : vault.key;
        });
    }
    setKey(vaultKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const vault = yield this.db.vaults.default();
            if (vault)
                return;
            yield this.db.vaults.add({ title: "Default", key: vaultKey });
        });
    }
}
exports.default = Vault;
