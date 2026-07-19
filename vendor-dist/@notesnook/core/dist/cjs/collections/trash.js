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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dayjs_1 = __importDefault(require("dayjs"));
const array_js_1 = require("../utils/array.js");
const virtualized_grouping_js_1 = require("../utils/virtualized-grouping.js");
const grouping_js_1 = require("../utils/grouping.js");
const kysely_1 = require("@streetwriters/kysely");
const sql_collection_js_1 = require("../database/sql-collection.js");
const notebooks_js_1 = require("./notebooks.js");
class Trash {
    constructor(db) {
        this.db = db;
        this.collections = ["notes", "notebooks"];
        this.cache = {
            notebooks: [],
            notes: []
        };
        this.userDeletedCache = {
            notebooks: [],
            notes: []
        };
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.buildCache();
        });
    }
    buildCache() {
        return __awaiter(this, void 0, void 0, function* () {
            this.cache.notes = [];
            this.cache.notebooks = [];
            this.userDeletedCache.notes = [];
            this.userDeletedCache.notebooks = [];
            const result = yield this.db
                .sql()
                .selectFrom("notes")
                .where("type", "==", "trash")
                .select(["id", (0, kysely_1.sql) `'note'`.as("itemType"), "deletedBy"])
                .unionAll((eb) => eb
                .selectFrom("notebooks")
                .where("type", "==", "trash")
                .select(["id", (0, kysely_1.sql) `'notebook'`.as("itemType"), "deletedBy"]))
                .execute();
            for (const { id, itemType, deletedBy } of result) {
                if (itemType === "note") {
                    this.cache.notes.push(id);
                    if (deletedBy === "user" || deletedBy === "expired")
                        this.userDeletedCache.notes.push(id);
                }
                else if (itemType === "notebook") {
                    this.cache.notebooks.push(id);
                    if (deletedBy === "user")
                        this.userDeletedCache.notebooks.push(id);
                }
            }
        });
    }
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            const duration = this.db.settings.getTrashCleanupInterval();
            if (duration === -1 || !duration) {
                yield this.buildCache();
                return;
            }
            const maxMs = (0, dayjs_1.default)()
                .startOf("day")
                .subtract(duration, "days")
                .toDate()
                .getTime();
            const expiredItems = yield this.db
                .sql()
                .selectNoFrom((eb) => [
                eb
                    .selectFrom("notes")
                    .where("type", "==", "trash")
                    .where("dateDeleted", "<=", maxMs)
                    .select("id")
                    .as("noteId"),
                eb
                    .selectFrom("notebooks")
                    .where("type", "==", "trash")
                    .where("dateDeleted", "<=", maxMs)
                    .select("id")
                    .as("notebookId")
            ])
                .execute();
            const { noteIds, notebookIds } = expiredItems.reduce((ids, item) => {
                if (item.noteId)
                    ids.noteIds.push(item.noteId);
                if (item.notebookId)
                    ids.notebookIds.push(item.notebookId);
                return ids;
            }, { noteIds: [], notebookIds: [] });
            yield this._delete(noteIds, notebookIds);
            yield this.buildCache();
        });
    }
    add(type_1, ids_1) {
        return __awaiter(this, arguments, void 0, function* (type, ids, deletedBy = "user") {
            if (type === "note") {
                yield this.db.notes.collection.update(ids, {
                    type: "trash",
                    itemType: "note",
                    dateDeleted: Date.now(),
                    deletedBy
                });
                this.cache.notes.push(...ids);
                if (deletedBy === "user" || deletedBy === "expired")
                    this.userDeletedCache.notes.push(...ids);
            }
            else if (type === "notebook") {
                yield this.db.notebooks.collection.update(ids, {
                    type: "trash",
                    itemType: "notebook",
                    dateDeleted: Date.now(),
                    deletedBy
                });
                this.cache.notebooks.push(...ids);
                if (deletedBy === "user")
                    this.userDeletedCache.notebooks.push(...ids);
            }
        });
    }
    delete(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            if (ids.length <= 0)
                return;
            const noteIds = ids.filter((id) => this.cache.notes.includes(id));
            const notebookIds = ids.filter((id) => this.cache.notebooks.includes(id));
            yield this._delete(noteIds, notebookIds);
        });
    }
    _delete(noteIds, notebookIds) {
        return __awaiter(this, void 0, void 0, function* () {
            if (noteIds.length > 0) {
                for (const chunk of (0, array_js_1.toChunks)(noteIds, sql_collection_js_1.MAX_SQL_PARAMETERS)) {
                    yield this.db.content.removeByNoteId(...chunk);
                    yield this.db.noteHistory.clearSessions(...chunk);
                    yield this.db.notes.remove(...chunk);
                    (0, array_js_1.deleteItems)(this.cache.notes, ...chunk);
                    (0, array_js_1.deleteItems)(this.userDeletedCache.notes, ...chunk);
                }
            }
            if (notebookIds.length > 0) {
                const ids = [...notebookIds, ...(yield this.subNotebooks(notebookIds))];
                for (const chunk of (0, array_js_1.toChunks)(ids, sql_collection_js_1.MAX_SQL_PARAMETERS)) {
                    yield this.db.notebooks.remove(...chunk);
                    yield this.db.relations.unlinkOfType("notebook", chunk);
                    (0, array_js_1.deleteItems)(this.cache.notebooks, ...chunk);
                    (0, array_js_1.deleteItems)(this.userDeletedCache.notebooks, ...chunk);
                }
            }
        });
    }
    restore(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            if (ids.length <= 0)
                return;
            const noteIds = ids.filter((id) => this.cache.notes.includes(id));
            const notebookIds = ids.filter((id) => this.cache.notebooks.includes(id));
            if (noteIds.length > 0) {
                yield this.db.notes.collection.update(noteIds, {
                    type: "note",
                    dateDeleted: null,
                    itemType: null,
                    deletedBy: null
                });
                (0, array_js_1.deleteItems)(this.cache.notes, ...noteIds);
                (0, array_js_1.deleteItems)(this.userDeletedCache.notes, ...noteIds);
            }
            if (notebookIds.length > 0) {
                const ids = [...notebookIds, ...(yield this.subNotebooks(notebookIds))];
                yield this.db.notebooks.collection.update(ids, {
                    type: "notebook",
                    dateDeleted: null,
                    itemType: null,
                    deletedBy: null
                });
                (0, array_js_1.deleteItems)(this.cache.notebooks, ...ids);
                (0, array_js_1.deleteItems)(this.userDeletedCache.notebooks, ...ids);
            }
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._delete(this.cache.notes, this.cache.notebooks);
            this.cache = { notebooks: [], notes: [] };
            this.userDeletedCache = { notebooks: [], notes: [] };
        });
    }
    // synced(id: string) {
    //   // const [item] = this.getItem(id);
    //   if (item && item.itemType === "note") {
    //     const { contentId } = item;
    //     return !contentId || this.db.content.exists(contentId);
    //   } else return true;
    // }
    all(deletedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            return [
                ...(yield this.trashedNotes(this.cache.notes, deletedBy)),
                ...(yield this.trashedNotebooks(this.cache.notebooks, deletedBy))
            ];
        });
    }
    count() {
        return this.cache.notes.length + this.cache.notebooks.length;
    }
    trashedNotes(ids, deletedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            if (ids.length <= 0)
                return [];
            return (yield this.db
                .sql()
                .selectFrom("notes")
                .where("type", "==", "trash")
                .where("id", "in", ids)
                .$if(!!deletedBy, (eb) => eb.where("deletedBy", "in", deletedBy))
                .selectAll()
                .execute());
        });
    }
    trashedNotebooks(ids, deletedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            if (ids.length <= 0)
                return [];
            return (yield this.db
                .sql()
                .selectFrom("notebooks")
                .where("type", "==", "trash")
                .where("id", "in", ids)
                .$if(!!deletedBy, (eb) => eb.where("deletedBy", "in", deletedBy))
                .selectAll()
                .execute());
        });
    }
    grouped(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const ids = [
                ...this.userDeletedCache.notes,
                ...this.userDeletedCache.notebooks
            ];
            const selector = (0, grouping_js_1.getSortSelectors)(options)[options.sortDirection];
            return new virtualized_grouping_js_1.VirtualizedGrouping(ids.length, this.db.options.batchSize, () => Promise.resolve(ids), (start, end) => __awaiter(this, void 0, void 0, function* () {
                const slicedIds = ids.slice(start, end);
                const noteIds = slicedIds.filter((id) => this.userDeletedCache.notes.includes(id));
                const notebookIds = slicedIds.filter((id) => this.userDeletedCache.notebooks.includes(id));
                const items = [
                    ...(yield this.trashedNotes(noteIds)),
                    ...(yield this.trashedNotebooks(notebookIds))
                ];
                items.sort(selector);
                return {
                    ids: slicedIds,
                    items
                };
            }), (items) => (0, grouping_js_1.groupArray)(items, (0, grouping_js_1.createKeySelector)(options)), () => __awaiter(this, void 0, void 0, function* () {
                const items = yield this.all();
                items.sort(selector);
                return Array.from((0, grouping_js_1.groupArray)(items, (0, grouping_js_1.createKeySelector)(options)).values());
            }));
        });
    }
    /**
     *
     * @param {string} id
     */
    exists(id) {
        return this.cache.notebooks.includes(id) || this.cache.notes.includes(id);
    }
    subNotebooks(notebookIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const ids = yield (0, notebooks_js_1.withSubNotebooks)(this.db.sql(), notebookIds, this.userDeletedCache.notebooks)
                .selectFrom("subNotebooks")
                .select("id")
                .where("id", "not in", notebookIds)
                .execute();
            return ids.map((ref) => ref.id);
        });
    }
}
exports.default = Trash;
