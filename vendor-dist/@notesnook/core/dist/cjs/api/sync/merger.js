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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isContentConflicted = isContentConflicted;
exports.handleInboxItems = handleInboxItems;
const logger_js_1 = require("../../logger.js");
const html_diff_js_1 = require("../../utils/html-diff.js");
const types_js_1 = require("../../types.js");
const zod_1 = require("zod");
const html_parser_js_1 = require("../../utils/html-parser.js");
const THRESHOLD = process.env.NODE_ENV === "test" ? 2 * 1000 : 60 * 1000;
class Merger {
    constructor(db) {
        this.db = db;
        this.logger = logger_js_1.logger.scope("Merger");
    }
    // isSyncCollection(type: string): type is keyof typeof SYNC_COLLECTIONS_MAP {
    //   return type in SYNC_COLLECTIONS_MAP;
    // }
    mergeItem(remoteItem, localItem) {
        if (!localItem || remoteItem.dateModified > localItem.dateModified) {
            this.logger.debug(`Remote item is newer. Using remote item.`, {
                id: remoteItem.id,
                remoteDateModified: remoteItem.dateModified,
                localDateModified: localItem === null || localItem === void 0 ? void 0 : localItem.dateModified
            });
            return remoteItem;
        }
        if (!remoteItem.deleted &&
            remoteItem.type === "note" &&
            !localItem.deleted &&
            localItem.type === "trash" &&
            localItem.itemType === "note" &&
            localItem.deletedBy === "expired") {
            if (remoteItem.expiryDate.dateModified > localItem.expiryDate.dateModified) {
                localItem.expiryDate = remoteItem.expiryDate;
                localItem.type = "note";
                localItem.deletedBy = null;
                localItem.dateDeleted = null;
                localItem.itemType = null;
                this.logger.debug(`Remote note has newer expiry date. Restoring expired note.`, {
                    id: remoteItem.id,
                    remoteExpiryDateModified: remoteItem.expiryDate.dateModified,
                    localExpiryDateModified: localItem.expiryDate.dateModified
                });
                return localItem;
            }
        }
    }
    mergeContent(remoteItem, localItem) {
        if (localItem && "localOnly" in localItem && localItem.localOnly) {
            this.logger.debug(`Local item is marked as localOnly. Skipping merge and keeping local item.`, {
                id: localItem.id,
                localOnly: localItem.localOnly
            });
            return;
        }
        if (!localItem ||
            (0, types_js_1.isDeleted)(localItem) ||
            (0, types_js_1.isDeleted)(remoteItem) ||
            remoteItem.type !== "tiptap" ||
            localItem.type !== "tiptap" ||
            !localItem.data ||
            !remoteItem.data) {
            return this.mergeItem(remoteItem, localItem);
        }
        else {
            // it's possible that the local item already has a conflict so
            // we can just replace the conflicted content
            const conflicted = localItem.conflicted
                ? "conflict"
                : isContentConflicted(localItem, remoteItem, THRESHOLD);
            this.logger.debug(`Content conflict check result: ${conflicted}`, {
                id: localItem.id,
                localDateModified: localItem.dateModified,
                remoteDateModified: remoteItem.dateModified,
                localDateResolved: localItem.dateResolved,
                timeDifference: Math.max(remoteItem.dateEdited, localItem.dateEdited) -
                    Math.min(remoteItem.dateEdited, localItem.dateEdited)
            });
            if (conflicted === "merge")
                return remoteItem;
            else if (!conflicted)
                return;
            // otherwise we trigger the conflicts
            this.logger.info("conflict marked", { id: localItem.noteId });
            localItem.conflicted = remoteItem;
            return localItem;
        }
    }
    mergeAttachment(remoteItem, localItem) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!localItem ||
                (0, types_js_1.isDeleted)(localItem) ||
                (0, types_js_1.isDeleted)(remoteItem) ||
                !localItem.dateUploaded ||
                !remoteItem.dateUploaded ||
                localItem.dateUploaded === remoteItem.dateUploaded) {
                return this.mergeItem(remoteItem, localItem);
            }
            if (localItem.dateUploaded > remoteItem.dateUploaded)
                return;
            logger_js_1.logger.debug("Removing local attachment file due to conflict", {
                hash: localItem.hash
            });
            const isRemoved = yield this.db.fs().deleteFile(localItem.hash, true);
            if (!isRemoved)
                throw new Error("Conflict could not be resolved in one of the attachments.");
            return remoteItem;
        });
    }
}
exports.default = Merger;
function isContentConflicted(localItem, remoteItem, conflictThreshold) {
    const isResolved = localItem.dateResolved &&
        remoteItem.dateModified &&
        localItem.dateResolved === remoteItem.dateModified;
    const isEdited = 
    // the local item is edited if it wasn't synced yet.
    !localItem.synced;
    if (isEdited && !isResolved) {
        // If time difference between local item's edits & remote item's edits
        // is less than threshold, we shouldn't trigger a merge conflict; instead
        // we will keep the most recently changed item.
        const timeDiff = Math.max(remoteItem.dateEdited, localItem.dateEdited) -
            Math.min(remoteItem.dateEdited, localItem.dateEdited);
        if (timeDiff < conflictThreshold ||
            (0, html_diff_js_1.isHTMLEqual)(localItem.data, remoteItem.data)) {
            if (remoteItem.dateModified > localItem.dateModified) {
                return "merge";
            }
            return;
        }
        return "conflict";
    }
    else if (!isResolved) {
        return "merge";
    }
}
const RawInboxItemSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, "Title is required"),
    pinned: zod_1.z.boolean().optional(),
    favorite: zod_1.z.boolean().optional(),
    readonly: zod_1.z.boolean().optional(),
    archived: zod_1.z.boolean().optional(),
    notebookIds: zod_1.z.array(zod_1.z.string()).optional(),
    tagIds: zod_1.z.array(zod_1.z.string()).optional(),
    type: zod_1.z.enum(["note"]),
    source: zod_1.z.string().min(1, "Source is required"),
    version: zod_1.z.literal(1),
    content: zod_1.z
        .object({
        type: zod_1.z.enum(["html"]),
        data: zod_1.z.string()
    })
        .optional()
});
function handleInboxItems(inboxItems, db) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const inboxKeys = yield db.user.getInboxKeys();
        if (!inboxKeys) {
            logger_js_1.logger.error("No inbox keys found, cannot process inbox items.");
            return;
        }
        for (const item of inboxItems) {
            try {
                if (yield db.inboxItemsHistory.exists(item.id)) {
                    logger_js_1.logger.info("Inbox item already processed, skipping.", {
                        inboxItemId: item.id
                    });
                    continue;
                }
                let decryptedItem;
                try {
                    decryptedItem = yield db
                        .storage()
                        .decryptPGPMessage(inboxKeys.privateKey, item.cipher);
                }
                catch (e) {
                    logger_js_1.logger.error(e, "Failed to decrypt inbox item.", {
                        inboxItemId: item.id
                    });
                    yield db.inboxItemsHistory.add({
                        id: item.id,
                        status: "failed",
                        errorContext: JSON.stringify({
                            message: "Decryption failed",
                            description: e.message,
                            inboxItem: { id: item.id, v: item.v, alg: item.alg }
                        })
                    });
                    continue;
                }
                let parsed;
                try {
                    parsed = JSON.parse(decryptedItem);
                }
                catch (e) {
                    logger_js_1.logger.error(e, "Failed to parse inbox item JSON.", {
                        inboxItemId: item.id
                    });
                    yield db.inboxItemsHistory.add({
                        id: item.id,
                        status: "failed",
                        errorContext: JSON.stringify({
                            message: "Invalid JSON",
                            description: e.message,
                            inboxItem: { id: item.id, v: item.v, alg: item.alg },
                            decryptedItem
                        })
                    });
                    continue;
                }
                const validation = RawInboxItemSchema.safeParse(parsed);
                if (!validation.success) {
                    logger_js_1.logger.warn("Failed to validate inbox item.", {
                        inboxItem: item,
                        errors: validation.error.issues
                    });
                    const _c = parsed, { content: _content } = _c, parsedWithoutContent = __rest(_c, ["content"]);
                    yield db.inboxItemsHistory.add({
                        id: item.id,
                        status: "failed",
                        errorContext: JSON.stringify({
                            message: "Validation failed",
                            description: validation.error.issues
                                .map((i) => `${i.path.join(".")}: ${i.message}`)
                                .join("; "),
                            inboxItem: { id: item.id, v: item.v, alg: item.alg },
                            parsedItem: parsedWithoutContent
                        })
                    });
                    continue;
                }
                const data = validation.data;
                yield db.notes.add({
                    id: item.id,
                    title: data.title,
                    favorite: data.favorite,
                    pinned: data.pinned,
                    readonly: data.readonly,
                    content: {
                        data: (0, html_parser_js_1.sanitizeHtml)((_b = (_a = data === null || data === void 0 ? void 0 : data.content) === null || _a === void 0 ? void 0 : _a.data) !== null && _b !== void 0 ? _b : ""),
                        type: "tiptap"
                    }
                });
                if (data.archived !== undefined) {
                    yield db.notes.archive(data.archived, item.id);
                }
                for (const notebookId of data.notebookIds || []) {
                    if (!(yield db.notebooks.exists(notebookId)))
                        continue;
                    yield db.notes.addToNotebook(notebookId, item.id);
                }
                for (const tagId of data.tagIds || []) {
                    if (!(yield db.tags.exists(tagId)))
                        continue;
                    yield db.relations.add({ type: "tag", id: tagId }, { type: "note", id: item.id });
                }
                yield db.inboxItemsHistory.add({
                    id: item.id,
                    status: "success",
                    source: data.source
                });
                yield db.relations.add({ type: "inboxitemhistory", id: item.id }, { type: "note", id: item.id });
            }
            catch (e) {
                logger_js_1.logger.error(e, "Failed to process inbox item.", {
                    inboxItem: item
                });
            }
        }
    });
}
