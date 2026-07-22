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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { getId } from "../utils/id.js";
import { EVENTS } from "../common.js";
import dataurl from "../utils/dataurl.js";
import dayjs from "dayjs";
import { DocumentMimeTypes, getFileNameWithExtension } from "../utils/filename.js";
import { FilteredSelector, SQLCollection } from "../database/sql-collection.js";
import { isFalse } from "../database/index.js";
import { sql } from "@streetwriters/kysely";
import { logger } from "../logger.js";
export class Attachments {
    constructor(db) {
        this.db = db;
        this.name = "attachments";
        this.collection = new SQLCollection(db.sql, db.transaction, "attachments", db.eventManager, db.sanitizer);
        db.eventManager.subscribe(EVENTS.fileDownloaded, (_a) => __awaiter(this, [_a], void 0, function* ({ success, filename, groupId, eventData }) {
            if (!success || !eventData || !eventData.readOnDownload)
                return;
            const attachment = yield this.attachment(filename);
            if (!attachment)
                return;
            const src = yield this.read(filename, getOutputType(attachment));
            if (!src)
                return;
            this.db.eventManager.publish(EVENTS.mediaAttachmentDownloaded, {
                groupId,
                hash: attachment.hash,
                attachmentType: getAttachmentType(attachment),
                src
            });
        }));
        db.eventManager.subscribe(EVENTS.fileUploaded, (_a) => __awaiter(this, [_a], void 0, function* ({ success, error, filename }) {
            const attachment = yield this.attachment(filename);
            if (!attachment)
                return;
            if (success)
                yield this.markAsUploaded(attachment.id);
            else
                yield this.markAsFailed(attachment.id, error || "Failed to upload attachment.");
        }));
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
        });
    }
    add(item) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!item)
                throw new Error("attachment cannot be undefined");
            if (!item.hash)
                throw new Error("Please provide attachment hash.");
            const oldAttachment = yield this.attachment(item.hash);
            const id = (oldAttachment === null || oldAttachment === void 0 ? void 0 : oldAttachment.id) || getId();
            const encryptedKey = item.key
                ? yield this.encryptKey(item.key)
                : oldAttachment === null || oldAttachment === void 0 ? void 0 : oldAttachment.key;
            const attachment = Object.assign(Object.assign(Object.assign({}, oldAttachment), item), { key: encryptedKey });
            const { iv, size, alg, hash, hashType, filename, mimeType, salt, chunkSize, key } = attachment;
            if (!iv ||
                !size ||
                !alg ||
                !hash ||
                !hashType ||
                // !filename ||
                //  !mimeType ||
                !salt ||
                !chunkSize ||
                !key) {
                logger.error({}, "Attachment is invalid because all properties are required:", { attachment });
                return;
            }
            yield this.collection.upsert({
                type: "attachment",
                id,
                iv,
                salt,
                size,
                alg,
                key,
                chunkSize,
                filename: filename ||
                    (yield getFileNameWithExtension(filename || hash, mimeType || "application/octet-stream")),
                hash,
                hashType,
                mimeType: mimeType || "application/octet-stream",
                dateCreated: attachment.dateCreated || Date.now(),
                dateModified: attachment.dateModified || Date.now(),
                dateUploaded: attachment.dateUploaded,
                failed: attachment.failed
            });
            return id;
        });
    }
    generateKey() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._getEncryptionKey();
            return yield this.db.crypto().generateRandomKey();
        });
    }
    decryptKey(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const encryptionKey = yield this._getEncryptionKey();
            const plainData = yield this.db.storage().decrypt(encryptionKey, key);
            if (!plainData)
                return null;
            return JSON.parse(plainData);
        });
    }
    remove(hashOrId, localOnly) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug("Removing attachment", { hashOrId, localOnly });
            const attachment = yield this.attachment(hashOrId);
            if (!attachment) {
                logger.debug("Attachment not found", { hashOrId, localOnly });
                return false;
            }
            if (!localOnly && !(yield this.canDetach(attachment)))
                throw new Error("This attachment is inside a locked note.");
            if (yield this.db
                .fs()
                .deleteFile(attachment.hash, localOnly || !attachment.dateUploaded)) {
                if (!localOnly) {
                    yield this.detach(attachment);
                }
                yield this.db.relations.unlinkOfType("attachment", [attachment.id]);
                yield this.collection.softDelete([attachment.id]);
                return true;
            }
            return false;
        });
    }
    bulkRemove(attachments, localOnly) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug("Bulk removing attachments", {
                count: attachments.length,
                localOnly
            });
            if (attachments.length === 0)
                return;
            const detachable = [];
            for (const attachment of attachments) {
                if (!localOnly && !(yield this.canDetach(attachment)))
                    continue;
                detachable.push(attachment);
            }
            const localOnlyHashes = detachable
                .filter((a) => localOnly || !a.dateUploaded)
                .map((a) => a.hash);
            const remoteHashes = detachable
                .filter((a) => !localOnly && !!a.dateUploaded)
                .map((a) => a.hash);
            if (localOnlyHashes.length > 0) {
                yield this.db.fs().bulkDeleteFiles(localOnlyHashes, true);
            }
            if (remoteHashes.length > 0) {
                yield this.db.fs().bulkDeleteFiles(remoteHashes, false);
            }
            if (!localOnly) {
                for (const attachment of detachable) {
                    yield this.detach(attachment);
                }
            }
            const ids = detachable.map((a) => a.id);
            yield this.db.relations.unlinkOfType("attachment", ids);
            yield this.collection.softDelete(ids);
        });
    }
    detach(attachment) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const note of yield this.db.relations
                .to(attachment, "note")
                .selector.fields(["notes.contentId"])
                .items()) {
                if (!note.contentId)
                    continue;
                yield this.db.content.removeAttachments(note.contentId, [
                    attachment.hash
                ]);
            }
        });
    }
    canDetach(attachment) {
        return __awaiter(this, void 0, void 0, function* () {
            const linkedNotes = yield this.db.relations.to(attachment, "note").get();
            return ((yield this.db.relations
                .to({ ids: linkedNotes.map((n) => n.toId), type: "note" }, "vault")
                .count()) <= 0);
        });
    }
    ofNote(noteId, ...types) {
        const selector = this.db.relations.from({ type: "note", id: noteId }, "attachment").selector;
        return new FilteredSelector("attachments", types.includes("all")
            ? selector.filter
            : selector.filter.where((eb) => {
                const filters = [];
                if (types.includes("images"))
                    filters.push(eb("mimeType", "like", `image/%`));
                if (types.includes("videos"))
                    filters.push(eb("mimeType", "like", `video/%`));
                if (types.includes("audio"))
                    filters.push(eb("mimeType", "like", `audio/%`));
                if (types.includes("documents"))
                    filters.push(eb("mimeType", "in", DocumentMimeTypes));
                if (types.includes("webclips"))
                    filters.push(eb("mimeType", "==", `application/vnd.notesnook.web-clip`));
                if (types.includes("files")) {
                    filters.push(eb.and([
                        eb("mimeType", "!=", `application/vnd.notesnook.web-clip`),
                        eb("mimeType", "not like", `image/%`)
                    ]));
                }
                return eb.or(filters);
            }));
    }
    exists(hash) {
        return __awaiter(this, void 0, void 0, function* () {
            return !!(yield this.attachment(hash));
        });
    }
    read(hash, outputType) {
        return __awaiter(this, void 0, void 0, function* () {
            const attachment = yield this.attachment(hash);
            if (!attachment)
                return;
            const key = yield this.decryptKey(attachment.key);
            if (!key)
                return;
            const data = yield this.db.fs().readEncrypted(attachment.hash, key, {
                chunkSize: attachment.chunkSize,
                iv: attachment.iv,
                salt: attachment.salt,
                size: attachment.size,
                alg: attachment.alg,
                outputType
            });
            if (!data)
                return;
            return (outputType === "base64" && typeof data === "string"
                ? dataurl.fromObject({
                    mimeType: attachment.mimeType,
                    data
                })
                : data);
        });
    }
    attachment(hashOrId) {
        return __awaiter(this, void 0, void 0, function* () {
            const attachment = yield this.all.find((eb) => eb.or([eb("id", "==", hashOrId), eb("hash", "==", hashOrId)]));
            if (attachment)
                logger.debug("attachment exists", { hashOrId });
            return attachment;
        });
    }
    markAsUploaded(id) {
        return this.collection.update([id], {
            dateUploaded: Date.now(),
            failed: null
        });
    }
    reset(id) {
        return this.collection.update([id], {
            dateUploaded: null
        });
    }
    markAsFailed(id, reason) {
        return this.collection.update([id], {
            failed: !reason ? null : reason
        });
    }
    cacheAttachments(attachments) {
        return __awaiter(this, void 0, void 0, function* () {
            const items = yield (attachments || this.db.attachments.linked)
                .fields(["attachments.id", "attachments.hash", "attachments.chunkSize"])
                .items();
            yield this.db.fs().queueDownloads(items.map((a) => ({
                filename: a.hash,
                chunkSize: a.chunkSize
            })), "offline-mode", { readOnDownload: false });
        });
    }
    save(data, mimeType, filename) {
        return __awaiter(this, void 0, void 0, function* () {
            const hashResult = yield this.db.fs().hashBase64(data);
            if (!hashResult)
                return;
            if (yield this.exists(hashResult.hash))
                return hashResult.hash;
            const key = yield this.generateKey();
            const _a = yield this.db
                .fs()
                .writeEncryptedBase64(data, key, mimeType), { hash, hashType } = _a, encryptionMetadata = __rest(_a, ["hash", "hashType"]);
            yield this.add(Object.assign(Object.assign({}, encryptionMetadata), { key, filename: filename || hash, hash,
                hashType, mimeType: mimeType || "application/octet-stream" }));
            return hash;
        });
    }
    downloadMedia(noteId, hashesToLoad) {
        return __awaiter(this, void 0, void 0, function* () {
            const attachments = this.ofNote(noteId, "images", "webclips").fields([
                "attachments.id",
                "attachments.hash",
                "attachments.chunkSize"
            ]);
            if (hashesToLoad)
                attachments.where((eb) => eb.and([eb("hash", "in", hashesToLoad)]));
            yield this.db.fs().queueDownloads((yield attachments.items()).map((a) => ({
                filename: a.hash,
                chunkSize: a.chunkSize
            })), noteId, { readOnDownload: true });
        });
    }
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            const now = dayjs().unix();
            const ids = [];
            try {
                for (var _d = true, _e = __asyncValues(this.deleted.iterate()), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const attachment = _c;
                    if (dayjs(attachment.dateDeleted).add(7, "days").unix() < now)
                        continue;
                    const isDeleted = yield this.db.fs().deleteFile(attachment.hash);
                    if (!isDeleted)
                        continue;
                    ids.push(attachment.id);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                }
                finally { if (e_1) throw e_1.error; }
            }
            yield this.collection.softDelete(ids);
        });
    }
    get pending() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("dateUploaded")).where(isFalse("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    // get uploaded() {
    //   return this.all.filter((attachment) => !!attachment.dateUploaded);
    // }
    // get syncable() {
    //   return this.collection
    //     .raw()
    //     .filter(
    //       (attachment) => isDeleted(attachment) || !!attachment.dateUploaded
    //     );
    // }
    get deleted() {
        var _a;
        return this.collection.createFilter((qb) => qb.where("dateDeleted", "is not", null), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get images() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("deleted")).where("mimeType", "like", `image/%`), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get videos() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("deleted")).where("mimeType", "like", `video/%`), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get audios() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("deleted")).where("mimeType", "like", `audio/%`), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get documents() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("deleted")).where("mimeType", "in", DocumentMimeTypes), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get webclips() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where(isFalse("deleted"))
            .where("mimeType", "==", `application/vnd.notesnook.web-clip`), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get orphaned() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where(isFalse("deleted"))
            .where("id", "not in", (eb) => eb
            .selectFrom("relations")
            .where("toType", "==", "attachment")
            .select("toId as id")
            .$narrowType()), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get linked() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where(isFalse("deleted"))
            .where("id", "in", (eb) => eb
            .selectFrom("relations")
            .where("toType", "==", "attachment")
            .select("toId as id")
            .$narrowType()), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    // get media() {
    //   return this.all.filter(
    //     (attachment) =>
    //       isImage(attachment.metadata.type) || isWebClip(attachment.metadata.type)
    //   );
    // }
    // get files() {
    //   return this.all.filter(
    //     (attachment) =>
    //       !isImage(attachment.metadata.type) &&
    //       !isWebClip(attachment.metadata.type)
    //   );
    // }
    get all() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    totalSize() {
        return __awaiter(this, arguments, void 0, function* (selector = this.all) {
            const result = yield selector.filter
                .select((eb) => eb.fn.sum(sql.raw(`size + 17`)).as("totalSize"))
                .executeTakeFirst();
            return result === null || result === void 0 ? void 0 : result.totalSize;
        });
    }
    encryptKey(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const encryptionKey = yield this._getEncryptionKey();
            const encryptedKey = yield this.db
                .storage()
                .encrypt(encryptionKey, JSON.stringify(key));
            return encryptedKey;
        });
    }
    _getEncryptionKey() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.key = yield ((_a = this.db.user) === null || _a === void 0 ? void 0 : _a.getAttachmentsKey());
            if (!this.key)
                throw new Error("Failed to get user encryption key. Cannot cache attachments.");
            return this.key;
        });
    }
    removeOrphaned() {
        return __awaiter(this, void 0, void 0, function* () {
            const orphaned = yield this.db.attachments.orphaned.items();
            logger.info("Deleting orphaned attachments", {
                attachments: orphaned
            });
            yield this.bulkRemove(orphaned, false);
        });
    }
}
export function getOutputType(attachment) {
    if (attachment.mimeType === "application/vnd.notesnook.web-clip")
        return "text";
    else if (attachment.mimeType.startsWith("image/"))
        return "base64";
    return "uint8array";
}
function getAttachmentType(attachment) {
    if (attachment.mimeType === "application/vnd.notesnook.web-clip")
        return "webclip";
    else if (attachment.mimeType.startsWith("image/"))
        return "image";
    else
        return "generic";
}
