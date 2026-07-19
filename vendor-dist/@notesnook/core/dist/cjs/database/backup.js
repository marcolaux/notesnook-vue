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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncDelegator = (this && this.__asyncDelegator) || function (o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const spark_md5_1 = __importDefault(require("spark-md5"));
const common_js_1 = require("../common.js");
const migrator_js_1 = __importDefault(require("./migrator.js"));
const types_js_1 = require("../types.js");
const crypto_js_1 = require("../utils/crypto.js");
const migrations_js_1 = require("../migrations.js");
const colors_js_1 = require("../collections/colors.js");
const array_js_1 = require("../utils/array.js");
const logger_js_1 = require("../logger.js");
function isEncryptedBackup(backup) {
    return "encrypted" in backup ? backup.encrypted : (0, crypto_js_1.isCipher)(backup.data);
}
/**
 * Due to a bug in v3.0, legacy backups were created with version set to 6.1
 * while their actual data was at version 5.9. This caused various issues when
 * restoring such a backup.
 * This function tries to work around that bug by detecting the version based on
 * the actual data.
 */
function isLegacyBackup(data) {
    const note = data.find((c) => !(0, types_js_1.isDeleted)(c) && !Array.isArray(c) && c.type === "note");
    if (note)
        return ("color" in note ||
            "notebooks" in note ||
            "tags" in note ||
            "locked" in note);
    const notebook = data.find((c) => !(0, types_js_1.isDeleted)(c) && !Array.isArray(c) && c.type === "notebook");
    if (notebook)
        return "topics" in notebook;
    const attachment = data.find((c) => !(0, types_js_1.isDeleted)(c) && !Array.isArray(c) && c.type === "attachment");
    if (attachment)
        return "noteIds" in attachment;
    const relation = data.find((c) => !(0, types_js_1.isDeleted)(c) && !Array.isArray(c) && c.type === "relation");
    if (relation)
        return "from" in relation || "to" in relation;
    return false;
}
const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
const invalidKeys = [
    "user",
    "t",
    "v",
    "lastBackupTime",
    "lastSynced",
    // all indexes
    "notes",
    "notebooks",
    "content",
    "tags",
    "colors",
    "attachments",
    "relations",
    "reminders",
    "sessioncontent",
    "notehistory",
    "shortcuts",
    "vaultKey",
    "hasConflict",
    "token",
    "monographs"
];
const itemTypeToCollectionKey = {
    note: "notes",
    notebook: "notebooks",
    tiptap: "content",
    tiny: "content",
    tag: "tags",
    color: "colors",
    attachment: "attachments",
    relation: "relations",
    reminder: "reminders",
    sessioncontent: "sessioncontent",
    session: "noteHistory",
    notehistory: "noteHistory",
    content: "content",
    shortcut: "shortcuts",
    settingitem: "settings",
    settings: "settings",
    vault: "vaults"
};
const validTypes = ["mobile", "web", "node"];
class Backup {
    constructor(db) {
        this.db = db;
        this.migrator = new migrator_js_1.default();
    }
    lastBackupTime() {
        return this.db.kv().read("lastBackupTime");
    }
    updateBackupTime() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.kv().write("lastBackupTime", Date.now());
        });
    }
    /**
     * @deprecated
     */
    exportLegacy(type_1) {
        return __asyncGenerator(this, arguments, function* exportLegacy_1(type, encrypt = false) {
            if (!validTypes.some((t) => t === type))
                throw new Error("Invalid type. It must be one of 'mobile' or 'web'.");
            if (encrypt && !(yield __await(this.db.user.getLegacyUser())))
                encrypt = false;
            const key = yield __await(this.db.user.getLegacyEncryptionKey());
            if (encrypt && !key)
                encrypt = false;
            const keys = yield __await(this.db.storage().getAllKeys());
            const chunks = (0, array_js_1.toChunks)(keys, 20);
            let buffer = [];
            let bufferLength = 0;
            const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
            let chunkIndex = 0;
            while (chunks.length > 0) {
                const chunk = chunks.pop();
                if (!chunk)
                    break;
                const items = yield __await(this.db.storage().readMulti(chunk));
                items.forEach(([id, item]) => {
                    const isDeleted = item &&
                        typeof item === "object" &&
                        "deleted" in item &&
                        !("type" in item);
                    if (!item ||
                        invalidKeys.includes(id) ||
                        isDeleted ||
                        id.startsWith("_uk_"))
                        return;
                    const data = JSON.stringify(item);
                    buffer.push(data);
                    bufferLength += data.length;
                });
                if (bufferLength >= MAX_CHUNK_SIZE || chunks.length === 0) {
                    let itemsJSON = `[${buffer.join(",")}]`;
                    buffer = [];
                    bufferLength = 0;
                    itemsJSON = yield __await((yield __await(this.db.compressor())).compress(itemsJSON));
                    const hash = spark_md5_1.default.hash(itemsJSON);
                    if (encrypt && key)
                        itemsJSON = JSON.stringify(yield __await(this.db.storage().encrypt(key, itemsJSON)));
                    else
                        itemsJSON = JSON.stringify(itemsJSON);
                    yield yield __await({
                        type: "file",
                        path: `${chunkIndex++}-${encrypt ? "encrypted" : "plain"}-${hash}`,
                        data: `{
"version": 5.9,
"type": "${type}",
"date": ${Date.now()},
"data": ${itemsJSON},
"hash": "${hash}",
"hash_type": "md5",
"compressed": true,
"encrypted": ${encrypt ? "true" : "false"}
}`
                    });
                }
            }
            if (bufferLength > 0 || buffer.length > 0)
                throw new Error("Buffer not empty.");
            yield __await(this.updateBackupTime());
        });
    }
    export(options) {
        return __asyncGenerator(this, arguments, function* export_1() {
            var _a, e_1, _b, _c;
            const { encrypt = false, type, mode = "partial" } = options;
            if (this.db.migrations.version === 5.9) {
                yield __await(yield* __asyncDelegator(__asyncValues(this.exportLegacy(type, encrypt))));
                return yield __await(void 0);
            }
            if (!validTypes.some((t) => t === type))
                throw new Error("Invalid type. It must be one of 'mobile' or 'web'.");
            const user = yield __await(this.db.user.getUser());
            if (encrypt && !user)
                throw new Error("Please login to create encrypted backups.");
            const key = yield __await(this.db.user.getMasterKey());
            if (encrypt && !key)
                throw new Error("No master key found.");
            yield yield __await({
                type: "file",
                path: ".nnbackup",
                data: ""
            });
            const backupState = {
                buffer: [],
                bufferLength: 0,
                chunkIndex: 0,
                key,
                encrypt,
                type
            };
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.notes.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.notebooks.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.content.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.noteHistory.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.noteHistory.sessionContent.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.colors.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.tags.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.settings.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.shortcuts.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.reminders.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.relations.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.attachments.collection, backupState))));
            yield __await(yield* __asyncDelegator(__asyncValues(this.backupCollection(this.db.vaults.collection, backupState))));
            if (backupState.buffer.length > 0)
                yield __await(yield* __asyncDelegator(__asyncValues(this.bufferToFile(backupState))));
            if (mode === "partial") {
                yield __await(this.updateBackupTime());
                return yield __await(void 0);
            }
            const total = yield __await(this.db.attachments.all.count());
            if (total > 0 && user && user.attachmentsKey) {
                yield yield __await({
                    type: "file",
                    path: `attachments/.attachments_key`,
                    data: backupState.encrypt
                        ? JSON.stringify(user.attachmentsKey)
                        : JSON.stringify((yield __await(this.db.user.getAttachmentsKey())) || {})
                });
                let current = 0;
                try {
                    for (var _d = true, _e = __asyncValues(this.db.attachments.all.iterate()), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                        _c = _f.value;
                        _d = false;
                        const attachment = _c;
                        current++;
                        if (!(yield __await(this.db
                            .fs()
                            .downloadFile("backup", attachment.hash, attachment.chunkSize))))
                            continue;
                        yield yield __await({
                            type: "attachment",
                            hash: attachment.hash,
                            path: `attachments/${attachment.hash}`,
                            total,
                            current
                        });
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
            yield __await(this.updateBackupTime());
        });
    }
    backupCollection(collection, state) {
        return __asyncGenerator(this, arguments, function* backupCollection_1() {
            var _a, e_2, _b, _c;
            try {
                for (var _d = true, _e = __asyncValues(collection.stream(this.db.options.batchSize)), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const item = _c;
                    const data = JSON.stringify(item);
                    state.buffer.push(data);
                    state.bufferLength += data.length;
                    if (state.bufferLength >= MAX_CHUNK_SIZE) {
                        yield __await(yield* __asyncDelegator(__asyncValues(this.bufferToFile(state))));
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                }
                finally { if (e_2) throw e_2.error; }
            }
        });
    }
    bufferToFile(state) {
        return __asyncGenerator(this, arguments, function* bufferToFile_1() {
            let itemsJSON = `[${state.buffer.join(",")}]`;
            state.buffer = [];
            state.bufferLength = 0;
            itemsJSON = yield __await((yield __await(this.db.compressor())).compress(itemsJSON));
            const hash = spark_md5_1.default.hash(itemsJSON);
            if (state.encrypt && state.key)
                itemsJSON = JSON.stringify(yield __await(this.db.storage().encrypt(state.key, itemsJSON)));
            else
                itemsJSON = JSON.stringify(itemsJSON);
            yield yield __await({
                type: "file",
                path: `${state.chunkIndex++}-${state.encrypt ? "encrypted" : "plain"}-${hash}`,
                data: `{
"version": ${common_js_1.CURRENT_DATABASE_VERSION},
"type": "${state.type}",
"date": ${Date.now()},
"data": ${itemsJSON},
"hash": "${hash}",
"hash_type": "md5",
"compressed": true,
"encrypted": ${state.encrypt ? "true" : "false"}
}`
            });
        });
    }
    import(backup_1) {
        return __awaiter(this, arguments, void 0, function* (backup, options = {}) {
            if (!this.validate(backup))
                throw new Error("Invalid backup.");
            const { encryptionKey, password, attachmentsKey } = options;
            backup = this.migrateBackup(backup);
            let decryptedData = undefined;
            let decryptedAttachmentsKey = undefined;
            if (isEncryptedBackup(backup)) {
                if (!password && !encryptionKey)
                    throw new Error("Please provide a password to decrypt this backup & restore it.");
                const key = encryptionKey
                    ? { key: encryptionKey, salt: backup.data.salt }
                    : password
                        ? yield this.db.storage().generateCryptoKey(password, backup.data.salt)
                        : undefined;
                if (!key)
                    throw new Error("Could not generate encryption key for backup.");
                decryptedAttachmentsKey = (0, crypto_js_1.isCipher)(attachmentsKey)
                    ? JSON.parse(yield this.db.storage().decrypt(key, attachmentsKey))
                    : attachmentsKey;
                try {
                    decryptedData = yield this.db.storage().decrypt(key, backup.data);
                }
                catch (e) {
                    logger_js_1.logger.error(e, "Failed to import backup");
                    if (e instanceof Error) {
                        if (e.message.includes("ciphertext cannot be decrypted") ||
                            e.message === "FAILURE")
                            throw new Error(encryptionKey ? "Invalid encryption key." : "Incorrect password.");
                        throw new Error(`Could not decrypt backup: ${e.message}`);
                    }
                }
            }
            else {
                if (!(0, crypto_js_1.isCipher)(attachmentsKey))
                    decryptedAttachmentsKey = attachmentsKey;
                decryptedData = backup.data;
            }
            if (!decryptedData)
                return;
            if ("hash" in backup && !this.verify(backup, decryptedData))
                throw new Error("Backup file has been tempered, aborting...");
            if ("compressed" in backup && typeof decryptedData === "string")
                decryptedData = yield (yield this.db.compressor()).decompress(decryptedData);
            const data = typeof decryptedData === "string"
                ? JSON.parse(decryptedData)
                : Object.values(decryptedData);
            if (!data)
                throw new Error("No data found.");
            const normalizedData = Array.isArray(data)
                ? data
                : typeof data === "object"
                    ? Object.values(data)
                    : [];
            yield this.migrateData(normalizedData, backup.version === 6.1 && isLegacyBackup(normalizedData)
                ? 5.9
                : backup.version, decryptedAttachmentsKey);
        });
    }
    migrateBackup(backup) {
        const { version = 0 } = backup;
        if (version > common_js_1.CURRENT_DATABASE_VERSION)
            throw new Error("This backup was made from a newer version of Notesnook. Cannot migrate.");
        switch (version) {
            case common_js_1.CURRENT_DATABASE_VERSION:
            case 6.0:
            case 5.9:
            case 5.8:
            case 5.7:
            case 5.6:
            case 5.5:
            case 5.4:
            case 5.3:
            case 5.2:
            case 5.1:
            case 5.0: {
                return backup;
            }
            default:
                throw new Error("Unknown backup version.");
        }
    }
    migrateData(data, version, attachmentsKey) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const queue = {};
            for (let item of data) {
                // we do not want to restore deleted items
                if (!item ||
                    typeof item !== "object" ||
                    Array.isArray(item) ||
                    (0, types_js_1.isDeleted)(item) ||
                    item.type === "searchResult")
                    continue;
                // in v5.6 of the database, we did not set note history session's type
                if ("sessionContentId" in item && item.type !== "session")
                    item.type = "notehistory";
                if ((yield (0, migrations_js_1.migrateItem)(item, version, common_js_1.CURRENT_DATABASE_VERSION, item.type, this.db, "backup")) === "skip")
                    continue;
                // since items in trash can have their own set of migrations,
                // we have to run the migration again to account for that.
                if (item.type === "trash" && item.itemType)
                    if ((yield (0, migrations_js_1.migrateItem)(item, version, common_js_1.CURRENT_DATABASE_VERSION, item.itemType, this.db, "backup")) === "skip")
                        continue;
                const itemType = 
                // colors are naively of type "tag" instead of "color" so we have to fix that.
                item.type === "tag" && colors_js_1.DefaultColors[item.title.toLowerCase()]
                    ? "color"
                    : item.type === "trash" && "itemType" in item && item.itemType
                        ? item.itemType
                        : item.type;
                if (!itemType || itemType === "topic" || itemType === "settings")
                    continue;
                if (item.type === "attachment" && (((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.hash) || item.hash)) {
                    const attachment = yield this.db.attachments.attachment(((_b = item.metadata) === null || _b === void 0 ? void 0 : _b.hash) || item.hash);
                    const isSameKey = !!attachment &&
                        attachment.key.iv === item.key.iv &&
                        attachment.key.cipher === item.key.cipher &&
                        attachment.key.salt === item.key.salt;
                    if (attachmentsKey && !isSameKey) {
                        const newKey = yield this.db.attachments.encryptKey(JSON.parse(yield this.db.storage().decrypt(attachmentsKey, item.key)));
                        if (attachment) {
                            attachment.key = newKey;
                            attachment.iv = item.iv;
                            attachment.salt = item.salt;
                            attachment.size = item.size;
                        }
                        else
                            item.key = newKey;
                        delete item.dateUploaded;
                        delete item.failed;
                    }
                    if (attachment) {
                        if (attachmentsKey &&
                            isSameKey &&
                            !(yield this.db.fs().exists(attachment.hash)) &&
                            (yield this.db.fs().getUploadedFileSize(attachment.hash)) <= 0) {
                            delete item.dateUploaded;
                            delete item.failed;
                        }
                        const isNewGeneric = ((_c = item.metadata) === null || _c === void 0 ? void 0 : _c.type) === "application/octet-stream" ||
                            item.mimeType === "application/octet-stream";
                        const isOldGeneric = attachment.mimeType === "application/octet-stream";
                        item = Object.assign(Object.assign({}, attachment), { mimeType: 
                            // we keep whichever mime type is more specific
                            isNewGeneric && !isOldGeneric
                                ? attachment.mimeType
                                : ((_d = item.metadata) === null || _d === void 0 ? void 0 : _d.type) || item.mimeType, filename: 
                            // we keep the filename based on which item's mime type we kept
                            isNewGeneric && !isOldGeneric
                                ? attachment.filename
                                : ((_e = item.metadata) === null || _e === void 0 ? void 0 : _e.filename) || item.filename });
                        for (const noteId of item.noteIds || []) {
                            yield this.db.relations.add({
                                id: noteId,
                                type: "note"
                            }, attachment);
                        }
                    }
                    else {
                        delete item.dateUploaded;
                        delete item.failed;
                    }
                }
                const collectionKey = itemTypeToCollectionKey[itemType];
                if (!collectionKey)
                    continue;
                if (itemType === "color") {
                    item.dateModified = Date.now();
                    item.synced = false;
                    yield this.db.colors.collection.upsert(item);
                }
                else if (itemType === "tag") {
                    item.dateModified = Date.now();
                    item.synced = false;
                    yield this.db.tags.collection.upsert(item);
                }
                else {
                    queue[collectionKey] = queue[collectionKey] || [];
                    (_f = queue[collectionKey]) === null || _f === void 0 ? void 0 : _f.push(item);
                }
            }
            for (const key in queue) {
                const collectionKey = key;
                const collection = collectionKey === "sessioncontent"
                    ? this.db.noteHistory.sessionContent.collection
                    : this.db[collectionKey].collection;
                if (!collection)
                    continue;
                const items = queue[collectionKey];
                if (!items)
                    continue;
                yield collection.put(items);
            }
        });
    }
    validate(backup) {
        return (!!backup.date &&
            !!backup.data &&
            !!backup.type &&
            validTypes.some((t) => t === backup.type));
    }
    verify(backup, data) {
        const { hash, hash_type } = backup;
        switch (hash_type) {
            case "md5": {
                return (hash ===
                    spark_md5_1.default.hash(typeof data === "string" ? data : JSON.stringify(data)));
            }
            default: {
                return false;
            }
        }
    }
}
exports.default = Backup;
