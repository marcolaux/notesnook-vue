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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Attachments = void 0;
exports.getOutputType = getOutputType;
const id_js_1 = require("../utils/id.js");
const common_js_1 = require("../common.js");
const dataurl_js_1 = __importDefault(require("../utils/dataurl.js"));
const dayjs_1 = __importDefault(require("dayjs"));
const filename_js_1 = require("../utils/filename.js");
const sql_collection_js_1 = require("../database/sql-collection.js");
const index_js_1 = require("../database/index.js");
const kysely_1 = require("@streetwriters/kysely");
const logger_js_1 = require("../logger.js");
class Attachments {
    constructor(db) {
        this.db = db;
        this.name = "attachments";
        this.collection = new sql_collection_js_1.SQLCollection(db.sql, db.transaction, "attachments", db.eventManager, db.sanitizer);
        common_js_1.EV.subscribe(common_js_1.EVENTS.fileDownloaded, (_a) => __awaiter(this, [_a], void 0, function* ({ success, filename, groupId, eventData }) {
            if (!success || !eventData || !eventData.readOnDownload)
                return;
            const attachment = yield this.attachment(filename);
            if (!attachment)
                return;
            const src = yield this.read(filename, getOutputType(attachment));
            if (!src)
                return;
            common_js_1.EV.publish(common_js_1.EVENTS.mediaAttachmentDownloaded, {
                groupId,
                hash: attachment.hash,
                attachmentType: getAttachmentType(attachment),
                src
            });
        }));
        common_js_1.EV.subscribe(common_js_1.EVENTS.fileUploaded, (_a) => __awaiter(this, [_a], void 0, function* ({ success, error, filename }) {
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
    /**
     * Required to satisfy the ICollection interface.
     * This collection does not currently maintain a local cache that needs invalidation,
     * but the method must exist for type safety when iterating over all collections.
     */
    invalidateCache() { }
    add(item) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!item)
                throw new Error("attachment cannot be undefined");
            if (!item.hash)
                throw new Error("Please provide attachment hash.");
            const oldAttachment = yield this.attachment(item.hash);
            const id = (oldAttachment === null || oldAttachment === void 0 ? void 0 : oldAttachment.id) || (0, id_js_1.getId)();
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
                logger_js_1.logger.error({}, "Attachment is invalid because all properties are required:", { attachment });
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
                    (yield (0, filename_js_1.getFileNameWithExtension)(filename || hash, mimeType || "application/octet-stream")),
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
            logger_js_1.logger.debug("Removing attachment", { hashOrId, localOnly });
            const attachment = yield this.attachment(hashOrId);
            if (!attachment) {
                logger_js_1.logger.debug("Attachment not found", { hashOrId, localOnly });
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
        return new sql_collection_js_1.FilteredSelector("attachments", types.includes("all")
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
                    filters.push(eb("mimeType", "in", filename_js_1.DocumentMimeTypes));
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
                ? dataurl_js_1.default.fromObject({
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
                logger_js_1.logger.debug("attachment exists", { hashOrId });
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
            const now = (0, dayjs_1.default)().unix();
            const ids = [];
            try {
                for (var _d = true, _e = __asyncValues(this.deleted.iterate()), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const attachment = _c;
                    if ((0, dayjs_1.default)(attachment.dateDeleted).add(7, "days").unix() < now)
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
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("dateUploaded")).where((0, index_js_1.isFalse)("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
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
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("deleted")).where("mimeType", "like", `image/%`), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get videos() {
        var _a;
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("deleted")).where("mimeType", "like", `video/%`), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get audios() {
        var _a;
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("deleted")).where("mimeType", "like", `audio/%`), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get documents() {
        var _a;
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("deleted")).where("mimeType", "in", filename_js_1.DocumentMimeTypes), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get webclips() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where((0, index_js_1.isFalse)("deleted"))
            .where("mimeType", "==", `application/vnd.notesnook.web-clip`), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get orphaned() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where((0, index_js_1.isFalse)("deleted"))
            .where("id", "not in", (eb) => eb
            .selectFrom("relations")
            .where("toType", "==", "attachment")
            .select("toId as id")
            .$narrowType()), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get linked() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where((0, index_js_1.isFalse)("deleted"))
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
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    totalSize() {
        return __awaiter(this, arguments, void 0, function* (selector = this.all) {
            const result = yield selector.filter
                .select((eb) => eb.fn.sum(kysely_1.sql.raw(`size + 17`)).as("totalSize"))
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
}
exports.Attachments = Attachments;
function getOutputType(attachment) {
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
