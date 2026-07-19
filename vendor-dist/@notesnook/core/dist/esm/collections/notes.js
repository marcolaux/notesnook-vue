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
import { HEADLINE_REGEX, NEWLINE_STRIP_REGEX, formatTitle } from "../utils/title-format.js";
import { clone } from "../utils/clone.js";
import { EMPTY_CONTENT } from "./content.js";
import { buildFromTemplate } from "../utils/templates/index.js";
import { isTrashItem, isDeleted } from "../types.js";
import { SQLCollection } from "../database/sql-collection.js";
import { isFalse } from "../database/index.js";
import { logger } from "../logger.js";
import { addItems, deleteItems } from "../utils/array.js";
import { sql } from "@streetwriters/kysely";
export class Notes {
    constructor(db) {
        this.db = db;
        this.name = "notes";
        this.cache = { archived: [] };
        this.totalNotes = 0;
        this.collection = new SQLCollection(db.sql, db.transaction, "notes", db.eventManager, db.sanitizer);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
            this.totalNotes = yield this.collection.count();
            yield this.buildCache();
        });
    }
    buildCache() {
        return __awaiter(this, void 0, void 0, function* () {
            this.cache.archived = [];
            const archived = yield this.archived.ids();
            this.cache.archived = archived;
        });
    }
    invalidateCache() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.buildCache();
        });
    }
    add(item) {
        return __awaiter(this, void 0, void 0, function* () {
            if (item.remote)
                throw new Error("Please use db.notes.merge to merge remote notes.");
            const id = item.id || getId();
            const isUpdating = item.id && (yield this.exists(item.id));
            if (!isUpdating && !item.content && !item.contentId && !item.title)
                throw new Error("Note must have a title or content.");
            yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                let contentId = item.contentId;
                let dateEdited = item.dateEdited;
                let headline = item.headline;
                let headlineTitle = "";
                if (item.content && item.content.data && item.content.type) {
                    logger.debug("saving content", { id });
                    const { type, data } = item.content;
                    const content = yield getContentFromData(type, data);
                    if (!content)
                        throw new Error("Invalid content type.");
                    headline = content.toHeadline();
                    headlineTitle = content.toTitle();
                    dateEdited = Date.now();
                    contentId = yield this.db.content.add(Object.assign({ noteId: id, sessionId: item.sessionId, id: contentId, dateEdited,
                        type,
                        data }, (item.localOnly !== undefined ? { localOnly: item.localOnly } : {})));
                }
                else if (contentId && item.localOnly !== undefined) {
                    yield this.db.content.add({
                        id: contentId,
                        localOnly: !!item.localOnly
                    });
                }
                if (typeof item.title !== "undefined") {
                    item.title = item.title.replace(NEWLINE_STRIP_REGEX, " ");
                    dateEdited = Date.now();
                }
                if (!isUpdating || item.title === "") {
                    item.isGeneratedTitle = !Boolean(item.title);
                    item.title =
                        item.title ||
                            formatTitle(this.db.settings.getTitleFormat(), this.db.settings.getDateFormat(), this.db.settings.getTimeFormat(), this.db.settings.getDayFormat(), headlineTitle, this.totalNotes);
                }
                const currentNoteTitleFields = yield this.db
                    .sql()
                    .selectFrom("notes")
                    .select(["isGeneratedTitle", "title"])
                    .where("id", "=", id)
                    .executeTakeFirst();
                if (isUpdating) {
                    const didUserEditTitle = Boolean(item.title);
                    item.isGeneratedTitle =
                        Boolean(currentNoteTitleFields === null || currentNoteTitleFields === void 0 ? void 0 : currentNoteTitleFields.isGeneratedTitle) &&
                            !didUserEditTitle;
                    const titleFormat = this.db.settings.getTitleFormat();
                    if (item.isGeneratedTitle &&
                        HEADLINE_REGEX.test(titleFormat) &&
                        headlineTitle &&
                        (currentNoteTitleFields === null || currentNoteTitleFields === void 0 ? void 0 : currentNoteTitleFields.title) !== headlineTitle) {
                        item.title = titleFormat.replace(HEADLINE_REGEX, headlineTitle);
                    }
                    else if (item.title === "")
                        item.title = (currentNoteTitleFields === null || currentNoteTitleFields === void 0 ? void 0 : currentNoteTitleFields.title) || "Untitled";
                }
                if (isUpdating) {
                    yield this.collection.update([id], {
                        title: item.title,
                        headline: headline,
                        contentId,
                        pinned: item.pinned,
                        favorite: item.favorite,
                        localOnly: item.localOnly,
                        conflicted: item.conflicted,
                        readonly: item.readonly,
                        dateCreated: item.dateCreated,
                        dateEdited: item.dateEdited || dateEdited,
                        isGeneratedTitle: item.isGeneratedTitle
                    });
                }
                else {
                    yield this.collection.upsert({
                        id,
                        type: "note",
                        contentId,
                        title: item.title,
                        headline: headline,
                        pinned: item.pinned,
                        favorite: item.favorite,
                        localOnly: item.localOnly,
                        conflicted: item.conflicted,
                        readonly: item.readonly,
                        dateCreated: item.dateCreated || Date.now(),
                        dateEdited: item.dateEdited || dateEdited || Date.now(),
                        isGeneratedTitle: item.isGeneratedTitle
                    });
                    this.totalNotes++;
                }
                if (item.sessionId && typeof item.title === "string") {
                    yield this.db.noteHistory.add(item.sessionId, {
                        title: item.title,
                        noteId: id
                    });
                }
            }));
            return id;
        });
    }
    note(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const note = yield this.collection.get(id);
            if (!note || isTrashItem(note) || isDeleted(note))
                return;
            return note;
        });
    }
    trashed(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const note = yield this.collection.get(id);
            if (note && (!isTrashItem(note) || isDeleted(note)))
                return;
            return note;
        });
    }
    tags(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.db.relations
                .to({ id, type: "note" }, "tag")
                .selector.items(undefined, {
                sortBy: "dateCreated",
                sortDirection: "asc"
            });
        });
    }
    // note(idOrNote: string | Note) {
    //   if (!idOrNote) return;
    //   const note =
    //     typeof idOrNote === "object" ? idOrNote : this.collection.get(idOrNote);
    //   if (!note || isTrashItem(note)) return;
    //   return createNoteModel(note, this.db);
    // }
    // get raw() {
    //   return this.collection.raw();
    // }
    get all() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where(isFalse("dateDeleted"))
            .where(isFalse("deleted"))
            .where(isFalse("archived")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get exportable() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("dateDeleted")).where(isFalse("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    // isTrashed(id: string) {
    //   return this.raw.find((item) => item.id === id && isTrashItem(item));
    // }
    // get trashed() {
    //   return this.raw.filter((item) =>
    //     isTrashItem(item)
    //   ) as BaseTrashItem<Note>[];
    // }
    get pinned() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where(isFalse("dateDeleted"))
            .where(isFalse("deleted"))
            .where("pinned", "==", true), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get conflicted() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where(isFalse("dateDeleted"))
            .where(isFalse("deleted"))
            .where("conflicted", "==", true), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get favorites() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where(isFalse("dateDeleted"))
            .where(isFalse("deleted"))
            .where(isFalse("archived"))
            .where("favorite", "==", true), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get archived() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where(isFalse("dateDeleted"))
            .where(isFalse("deleted"))
            .where("archived", "==", true), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    exists(id) {
        return this.collection.exists(id);
    }
    moveToTrash(...ids) {
        return this._delete(true, ...ids);
    }
    remove(...ids) {
        return this._delete(false, ...ids);
    }
    pin(state, ...ids) {
        return this.collection.update(ids, { pinned: state });
    }
    favorite(state, ...ids) {
        return this.collection.update(ids, { favorite: state });
    }
    archive(state, ...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.update(ids, { archived: state });
            if (state) {
                addItems(this.cache.archived, ...ids);
            }
            else {
                deleteItems(this.cache.archived, ...ids);
            }
        });
    }
    setExpiryDate(date, ...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.update(ids, {
                expiryDate: {
                    dateModified: Date.now(),
                    value: date
                }
            });
        });
    }
    readonly(state, ...ids) {
        return this.collection.update(ids, { readonly: state });
    }
    localOnly(state, ...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                yield this.collection.update(ids, { localOnly: state });
                yield this.db.content.updateByNoteId({ localOnly: state }, ...ids);
            }));
        });
    }
    export(noteOrId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const note = typeof noteOrId === "string" ? yield this.note(noteOrId) : noteOrId;
            if (!note)
                return false;
            const { format, rawContent } = options;
            const contentString = rawContent === undefined
                ? yield (() => __awaiter(this, void 0, void 0, function* () {
                    let contentItem = options.contentItem;
                    if (!contentItem) {
                        const rawContent = yield this.db.content.findByNoteId(note.id);
                        if (rawContent && rawContent.locked)
                            return false;
                        contentItem = rawContent || EMPTY_CONTENT(note.id);
                    }
                    const { data, type } = (options === null || options === void 0 ? void 0 : options.embedMedia) && format !== "txt"
                        ? yield this.db.content.downloadMedia(`export-${note.id}`, contentItem, false)
                        : contentItem;
                    const content = yield getContentFromData(type, data);
                    return format === "html"
                        ? content.toHTML()
                        : format === "md"
                            ? content.toMD()
                            : content.toTXT();
                }))()
                : rawContent;
            if (contentString === false)
                return false;
            const tags = (yield this.db.relations.to(note, "tag").resolve()).map((tag) => tag.title);
            const color = (_a = (yield this.db.relations.to(note, "color").resolve(1))[0]) === null || _a === void 0 ? void 0 : _a.title;
            return (options === null || options === void 0 ? void 0 : options.disableTemplate)
                ? contentString
                : buildFromTemplate(format, Object.assign(Object.assign({}, note), { tags,
                    color, content: contentString }));
        });
    }
    duplicate(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const id of ids) {
                const note = yield this.note(id);
                if (!note)
                    continue;
                const content = note.contentId
                    ? yield this.db.content.get(note.contentId)
                    : undefined;
                const duplicateId = yield this.db.notes.add(Object.assign(Object.assign({}, clone(note)), { id: undefined, readonly: false, favorite: false, pinned: false, contentId: undefined, title: note.title + " (Copy)", dateEdited: undefined, dateCreated: undefined, dateModified: undefined }));
                const contentId = yield this.db.content.add(Object.assign(Object.assign({}, clone(content)), { id: undefined, noteId: duplicateId, dateResolved: undefined, dateEdited: undefined, dateCreated: undefined, dateModified: undefined }));
                yield this.db.notes.add({ id: duplicateId, contentId });
                for (const relation of yield this.db.relations.to(note).get()) {
                    yield this.db.relations.add({ type: relation.fromType, id: relation.fromId }, {
                        id: duplicateId,
                        type: "note"
                    });
                }
                for (const relation of yield this.db.relations.from(note).get()) {
                    yield this.db.relations.add({
                        id: duplicateId,
                        type: "note"
                    }, { type: relation.toType, id: relation.toId });
                }
            }
        });
    }
    _delete() {
        return __awaiter(this, arguments, void 0, function* (moveToTrash = true, ...ids) {
            if (ids.length <= 0)
                return;
            if (moveToTrash) {
                yield this.db.trash.add("note", ids);
            }
            else {
                yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                    yield this.db.relations.unlinkOfType("note", ids);
                    yield this.collection.softDelete(ids);
                    yield this.db.content.removeByNoteId(...ids);
                }));
            }
            this.totalNotes = Math.max(0, this.totalNotes - ids.length);
        });
    }
    addToNotebook(notebookId, ...noteIds) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const noteId of noteIds) {
                yield this.db.relations.add({ id: notebookId, type: "notebook" }, { type: "note", id: noteId });
            }
        });
    }
    removeFromNotebook(notebookId, ...noteIds) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                for (const noteId of noteIds) {
                    yield this.db.relations.unlink({ id: notebookId, type: "notebook" }, { type: "note", id: noteId });
                }
            }));
        });
    }
    removeFromAllNotebooks(...noteIds) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.relations
                .to({ type: "note", ids: noteIds }, "notebook")
                .unlink();
        });
    }
    contentBlocks(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield this.db.content.findByNoteId(id);
            if (!content || content.locked)
                return [];
            return (yield getContentFromData(content.type, content.data)).extract("blocks").blocks;
        });
    }
    contentBlocksWithLinks(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield this.db.content.findByNoteId(id);
            if (!content || content.locked)
                return [];
            return (yield getContentFromData(content.type, content.data)).extract("blocksWithLink").blocks;
        });
    }
    internalLinks(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield this.db.content.findByNoteId(id);
            if (!content || content.locked)
                return [];
            return (yield getContentFromData(content.type, content.data)).extract("internalLinks").internalLinks;
        });
    }
    deleteExpiredNotes() {
        return __awaiter(this, void 0, void 0, function* () {
            const expiredItems = yield this.db
                .sql()
                .selectFrom("notes")
                .where("type", "!=", "trash")
                .where(sql `expiryDate ->> '$.value'`, "<", Date.now())
                .select("id as noteId")
                .execute();
            if (!expiredItems.length)
                return;
            const toDelete = expiredItems
                .map((item) => item.noteId)
                .filter((item) => item != null);
            yield this.db.trash.add("note", toDelete, "expired");
        });
    }
}
