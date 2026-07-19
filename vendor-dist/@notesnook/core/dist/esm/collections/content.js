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
import { getId } from "../utils/id.js";
import { getContentFromData } from "../content-types/index.js";
import { isCipher } from "../utils/crypto.js";
import { isDeleted } from "../types.js";
import { getOutputType } from "./attachments.js";
import { SQLCollection } from "../database/sql-collection.js";
import { tinyToTiptap } from "../migrations.js";
import { EVENTS } from "../common.js";
import { logger } from "../logger.js";
export const EMPTY_CONTENT = (noteId) => ({
    noteId,
    dateCreated: Date.now(),
    dateEdited: Date.now(),
    dateModified: Date.now(),
    id: getId(),
    localOnly: true,
    type: "tiptap",
    data: "<p></p>",
    locked: false
});
export class Content {
    constructor(db) {
        this.db = db;
        this.name = "content";
        this.collection = new SQLCollection(db.sql, db.transaction, "content", db.eventManager, db.sanitizer);
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
    add(content) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (typeof content.data === "object") {
                if ("data" in content.data && typeof content.data.data === "string")
                    content.data = content.data.data;
                else if (!content.data.iv && !content.data.cipher)
                    content.data = `<p>Content is invalid: ${JSON.stringify(content.data)}</p>`;
            }
            if (content.remote)
                throw new Error("Please use db.content.merge for merging remote content.");
            if (content.noteId && !content.id) {
                // find content from noteId
                logger.debug("finding content id", { id: content.noteId });
                content.id = (_a = (yield this.db
                    .sql()
                    .selectFrom("content")
                    .where("noteId", "==", content.noteId)
                    .select("id")
                    .executeTakeFirst())) === null || _a === void 0 ? void 0 : _a.id;
            }
            const id = content.id || getId();
            const encryptedData = isCipher(content.data) ? content.data : undefined;
            let unencryptedData = typeof content.data === "string" ? content.data : undefined;
            if (unencryptedData && content.type && content.noteId)
                unencryptedData = yield this.postProcess({
                    type: content.type,
                    data: unencryptedData,
                    noteId: content.noteId
                });
            if (content.id && (yield this.exists(content.id))) {
                const contentData = encryptedData
                    ? { locked: true, data: encryptedData }
                    : unencryptedData
                        ? { locked: false, data: unencryptedData }
                        : undefined;
                if (contentData)
                    logger.debug("updating content", {
                        id: content.noteId,
                        contentId: content.id,
                        length: JSON.stringify(contentData.data).length
                    });
                yield this.collection.update([content.id], Object.assign({ dateEdited: content.dateEdited, localOnly: content.localOnly, conflicted: content.dateResolved ? null : content.conflicted, dateResolved: content.dateResolved, noteId: content.noteId }, contentData));
                if (content.sessionId && contentData && content.type && content.noteId) {
                    yield this.db.noteHistory.add(content.sessionId, Object.assign({ noteId: content.noteId, type: content.type }, contentData));
                }
            }
            else if (content.noteId) {
                const contentItem = Object.assign({ type: "tiptap", noteId: content.noteId, id, dateEdited: content.dateEdited || Date.now(), dateCreated: content.dateCreated || Date.now(), dateModified: Date.now(), localOnly: !!content.localOnly, conflicted: content.conflicted, dateResolved: content.dateResolved }, (encryptedData
                    ? { locked: true, data: encryptedData }
                    : { locked: false, data: unencryptedData || "<p></p>" }));
                logger.debug("inserting content", {
                    id: content.noteId,
                    contentId: content.id,
                    length: JSON.stringify(contentItem.data).length
                });
                yield this.collection.upsert(contentItem);
                if (content.sessionId)
                    yield this.db.noteHistory.add(content.sessionId, contentItem);
            }
            else
                return;
            return id;
        });
    }
    get(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield this.collection.get(id);
            if (!content || isDeleted(content))
                return;
            if (!content.locked && (yield this.preProcess(content))) {
                yield this.collection.update([content.id], content, { modify: false });
            }
            return content;
        });
    }
    // async raw(id: string) {
    //   const content = await this.collection.get(id);
    //   if (!content) return;
    //   return content;
    // }
    remove(...ids) {
        return this.collection.softDelete(ids);
    }
    removeByNoteId(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db
                .sql()
                .replaceInto("content")
                .columns(["id", "dateModified", "deleted", "synced"])
                .expression((eb) => eb
                .selectFrom("content")
                .where("noteId", "in", ids)
                .select((eb) => [
                "content.id",
                eb.lit(Date.now()).as("dateModified"),
                eb.lit(1).as("deleted"),
                eb.lit(0).as("synced")
            ]))
                .execute();
            this.db.eventManager.publish(EVENTS.databaseUpdated, {
                collection: "content",
                type: "softDelete",
                ids
            });
        });
    }
    updateByNoteId(partial, ...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db
                .sql()
                .updateTable("content")
                .where("noteId", "in", ids)
                .set(Object.assign(Object.assign({}, partial), { dateModified: Date.now() }))
                .execute();
            this.db.eventManager.publish(EVENTS.databaseUpdated, {
                collection: "content",
                type: "update",
                ids,
                item: partial
            });
        });
    }
    findByNoteId(noteId) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = (yield this.db
                .sql()
                .selectFrom("content")
                .where("noteId", "==", noteId)
                .selectAll()
                .executeTakeFirst());
            if (!content || isDeleted(content))
                return;
            if (!content.locked && (yield this.preProcess(content))) {
                yield this.collection.update([content.id], content, { modify: false });
            }
            return content;
        });
    }
    // multi(ids: string[]) {
    //   return this.collection.getItems(ids);
    // }
    exists(id) {
        return this.collection.exists(id);
    }
    // async all() {
    //   return Object.values(
    //     await this.collection.getItems(this.collection.indexer.indices)
    //   );
    // }
    downloadMedia(groupId_1, contentItem_1) {
        return __awaiter(this, arguments, void 0, function* (groupId, contentItem, notify = true) {
            const content = yield getContentFromData(contentItem.type, contentItem.data);
            if (!content)
                return contentItem;
            contentItem.data = yield content.insertMedia((hashes) => __awaiter(this, void 0, void 0, function* () {
                const attachments = yield this.db.attachments.all
                    .where((eb) => eb("attachments.hash", "in", hashes))
                    .items();
                yield this.db.fs().queueDownloads(attachments.map((a) => ({
                    filename: a.hash,
                    chunkSize: a.chunkSize
                })), groupId, notify ? { readOnDownload: false } : undefined);
                const sources = {};
                for (const attachment of attachments) {
                    const src = yield this.db.attachments.read(attachment.hash, getOutputType(attachment));
                    if (!src || typeof src !== "string")
                        continue;
                    sources[attachment.hash] = src;
                }
                return sources;
            }));
            return contentItem;
        });
    }
    removeAttachments(id, hashes) {
        return __awaiter(this, void 0, void 0, function* () {
            const contentItem = yield this.get(id);
            if (!contentItem || isCipher(contentItem.data))
                return;
            const content = yield getContentFromData(contentItem.type, contentItem.data);
            if (!content)
                return;
            contentItem.data = content.removeAttachments(hashes);
            yield this.add(contentItem);
        });
    }
    preProcess(content) {
        return __awaiter(this, void 0, void 0, function* () {
            let changed = false;
            // #MIGRATION: convert tiny to tiptap
            if (content.type === "tiny") {
                content.type = "tiptap";
                content.data = tinyToTiptap(content.data);
                changed = true;
            }
            // add block id on all appropriate nodes
            if (!content.data.includes("data-block-id")) {
                content.data = (yield getContentFromData(content.type, content.data)).insertBlockIds();
                changed = true;
            }
            return changed;
        });
    }
    postProcess(contentItem) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield getContentFromData(contentItem.type, contentItem.data);
            if (!content)
                return contentItem.data;
            const { data, hashes, internalLinks } = yield content.postProcess(this.db.attachments.save.bind(this.db.attachments));
            yield this.processInternalLinks(contentItem.noteId, internalLinks);
            yield this.processLinkedAttachments(contentItem.noteId, hashes);
            return data;
        });
    }
    processLinkedAttachments(noteId, hashes) {
        return __awaiter(this, void 0, void 0, function* () {
            const noteAttachments = yield this.db.relations
                .from({ type: "note", id: noteId }, "attachment")
                .selector.filter.select(["id", "hash"])
                .execute();
            const toDelete = noteAttachments.filter((attachment) => {
                return hashes.every((hash) => hash !== attachment.hash);
            });
            for (const attachment of toDelete) {
                yield this.db.relations.unlink({
                    id: noteId,
                    type: "note"
                }, { id: attachment.id, type: "attachment" });
            }
            const toAdd = hashes.filter((hash) => {
                return hash && noteAttachments.every((a) => hash !== a.hash);
            });
            const attachments = yield this.db.attachments.all
                .fields(["attachments.id"])
                .where((eb) => eb("hash", "in", toAdd))
                .items();
            for (const attachment of attachments) {
                yield this.db.relations.add({
                    id: noteId,
                    type: "note"
                }, { id: attachment.id, type: "attachment" });
            }
        });
    }
    processInternalLinks(noteId, internalLinks) {
        return __awaiter(this, void 0, void 0, function* () {
            const links = yield this.db.relations
                .from({ type: "note", id: noteId }, "note")
                .get();
            const toDelete = links.filter((link) => {
                return internalLinks.every((l) => l.id !== link.toId);
            });
            const toAdd = internalLinks.filter((link) => {
                return links.every((l) => link.id !== l.toId);
            });
            for (const link of toDelete) {
                yield this.db.relations.unlink({
                    id: noteId,
                    type: "note"
                }, { id: link.toId, type: link.toType });
            }
            for (const link of toAdd) {
                const note = yield this.db.notes.exists(link.id);
                if (!note)
                    continue;
                yield this.db.relations.add({
                    id: noteId,
                    type: "note"
                }, link);
            }
        });
    }
}
