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
import dayjs from "dayjs";
import { deleteItems, toChunks } from "../utils/array.js";
import { VirtualizedGrouping } from "../utils/virtualized-grouping.js";
import { createKeySelector, getSortSelectors, groupArray } from "../utils/grouping.js";
import { sql } from "@streetwriters/kysely";
import { MAX_SQL_PARAMETERS } from "../database/sql-collection.js";
import { withSubNotebooks } from "./notebooks.js";
export default class Trash {
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
                .select(["id", sql `'note'`.as("itemType"), "deletedBy"])
                .unionAll((eb) => eb
                .selectFrom("notebooks")
                .where("type", "==", "trash")
                .select(["id", sql `'notebook'`.as("itemType"), "deletedBy"]))
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
            const maxMs = dayjs()
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
                for (const chunk of toChunks(noteIds, MAX_SQL_PARAMETERS)) {
                    yield this.db.content.removeByNoteId(...chunk);
                    yield this.db.noteHistory.clearSessions(...chunk);
                    yield this.db.notes.remove(...chunk);
                    deleteItems(this.cache.notes, ...chunk);
                    deleteItems(this.userDeletedCache.notes, ...chunk);
                }
            }
            if (notebookIds.length > 0) {
                const ids = [...notebookIds, ...(yield this.subNotebooks(notebookIds))];
                for (const chunk of toChunks(ids, MAX_SQL_PARAMETERS)) {
                    yield this.db.notebooks.remove(...chunk);
                    yield this.db.relations.unlinkOfType("notebook", chunk);
                    deleteItems(this.cache.notebooks, ...chunk);
                    deleteItems(this.userDeletedCache.notebooks, ...chunk);
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
                deleteItems(this.cache.notes, ...noteIds);
                deleteItems(this.userDeletedCache.notes, ...noteIds);
            }
            if (notebookIds.length > 0) {
                const ids = [...notebookIds, ...(yield this.subNotebooks(notebookIds))];
                yield this.db.notebooks.collection.update(ids, {
                    type: "notebook",
                    dateDeleted: null,
                    itemType: null,
                    deletedBy: null
                });
                deleteItems(this.cache.notebooks, ...ids);
                deleteItems(this.userDeletedCache.notebooks, ...ids);
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
            const selector = getSortSelectors(options)[options.sortDirection];
            return new VirtualizedGrouping(ids.length, this.db.options.batchSize, () => Promise.resolve(ids), (start, end) => __awaiter(this, void 0, void 0, function* () {
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
            }), (items) => groupArray(items, createKeySelector(options)), () => __awaiter(this, void 0, void 0, function* () {
                const items = yield this.all();
                items.sort(selector);
                return Array.from(groupArray(items, createKeySelector(options)).values());
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
            const ids = yield withSubNotebooks(this.db.sql(), notebookIds, this.userDeletedCache.notebooks)
                .selectFrom("subNotebooks")
                .select("id")
                .where("id", "not in", notebookIds)
                .execute();
            return ids.map((ref) => ref.id);
        });
    }
}
