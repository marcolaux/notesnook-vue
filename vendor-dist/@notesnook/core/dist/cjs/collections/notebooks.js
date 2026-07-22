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
exports.Notebooks = void 0;
exports.withSubNotebooks = withSubNotebooks;
const id_js_1 = require("../utils/id.js");
const types_js_1 = require("../types.js");
const sql_collection_js_1 = require("../database/sql-collection.js");
const index_js_1 = require("../database/index.js");
const kysely_1 = require("@streetwriters/kysely");
const array_js_1 = require("../utils/array.js");
class Notebooks {
    constructor(db) {
        this.db = db;
        this.name = "notebooks";
        this.collection = new sql_collection_js_1.SQLCollection(db.sql, db.transaction, "notebooks", db.eventManager, db.sanitizer);
    }
    init() {
        return this.collection.init();
    }
    add(notebookArg) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!notebookArg)
                throw new Error("Notebook cannot be undefined or null.");
            if (notebookArg.remote)
                throw new Error("Please use db.notebooks.merge to merge remote notebooks");
            const id = notebookArg.id || (0, id_js_1.getId)();
            const oldNotebook = yield this.notebook(id);
            if (oldNotebook && (0, types_js_1.isTrashItem)(oldNotebook))
                throw new Error("Cannot modify trashed notebooks.");
            const mergedNotebook = Object.assign(Object.assign({}, oldNotebook), notebookArg);
            if (!mergedNotebook.title)
                throw new Error("Notebook must contain a title.");
            yield this.collection.upsert({
                id,
                type: "notebook",
                title: mergedNotebook.title,
                description: mergedNotebook.description,
                pinned: !!mergedNotebook.pinned,
                dateCreated: mergedNotebook.dateCreated || Date.now(),
                dateModified: mergedNotebook.dateModified || Date.now(),
                dateEdited: Date.now()
            });
            return id;
        });
    }
    // get raw() {
    //   return this.collection.raw();
    // }
    get all() {
        var _a;
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("dateDeleted")).where((0, index_js_1.isFalse)("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    get pinned() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where((0, index_js_1.isFalse)("dateDeleted"))
            .where((0, index_js_1.isFalse)("deleted"))
            .where("pinned", "==", true), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    // get trashed() {
    //   return this.raw.filter((item) =>
    //     isTrashItem(item)
    //   ) as BaseTrashItem<Notebook>[];
    // }
    pin(state, ...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.update(ids, { pinned: state });
        });
    }
    totalNotes(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield withSubNotebooks(this.db.sql(), ids, this.db.trash.cache.notebooks)
                .selectFrom("relations")
                .innerJoin("subNotebooks", "subNotebooks.id", "relations.fromId")
                .where("toType", "==", "note")
                .where("fromType", "==", "notebook")
                .where("toId", "not in", this.db.trash.cache.notes)
                .select((eb) => [
                "subNotebooks.rootId as id",
                eb.fn.count("relations.toId").distinct().as("totalNotes")
            ])
                .groupBy("subNotebooks.rootId")
                .execute();
            return ids.map((id) => {
                const item = result.find((i) => i.id === id);
                return item ? item.totalNotes : 0;
            });
        });
    }
    notes(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield withSubNotebooks(this.db.sql(), ids, this.db.trash.cache.notebooks)
                .selectFrom("relations")
                .innerJoin("subNotebooks", "subNotebooks.id", "relations.fromId")
                .where("toType", "==", "note")
                .where("fromType", "==", "notebook")
                .where("toId", "not in", this.db.trash.cache.notes)
                .select("relations.toId as id")
                .distinct()
                .$narrowType()
                .execute();
            return result.map((i) => i.id);
        });
    }
    get roots() {
        var _a;
        return this.collection.createFilter((qb) => qb
            .where("id", "not in", (eb) => eb
            .selectFrom("relations")
            .where("toType", "==", "notebook")
            .where("fromType", "==", "notebook")
            .select("relations.toId as id")
            .$narrowType())
            .where((0, index_js_1.isFalse)("dateDeleted"))
            .where((0, index_js_1.isFalse)("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    breadcrumbs(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const ids = yield this.db
                .sql()
                .withRecursive(`subNotebooks(id)`, (eb) => eb
                .selectNoFrom((eb) => eb.val(id).as("id"))
                .unionAll((eb) => eb
                .selectFrom(["relations", "subNotebooks"])
                .select("relations.fromId as id")
                .where("toType", "==", "notebook")
                .where("fromType", "==", "notebook")
                .whereRef("toId", "==", "subNotebooks.id")
                .where("fromId", "not in", this.db.trash.cache.notebooks)
                .$narrowType()))
                .selectFrom("subNotebooks")
                .select("id")
                .execute();
            const records = yield this.all
                .fields(["notebooks.id", "notebooks.title"])
                .records(ids.map((i) => i.id));
            return ids
                .reverse()
                .map((id) => records[id.id])
                .filter(Boolean);
        });
    }
    notebook(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const notebook = yield this.collection.get(id);
            if (!notebook || (0, types_js_1.isTrashItem)(notebook))
                return;
            return notebook;
        });
    }
    find(title) {
        return this.all.find((eb) => eb("notebooks.title", "==", title));
    }
    exists(id) {
        return this.all.has(id);
    }
    moveToTrash(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.transaction((tr) => __awaiter(this, void 0, void 0, function* () {
                const query = withSubNotebooks(tr, ids, this.db.trash.cache.notebooks)
                    .selectFrom("subNotebooks")
                    .select("id");
                const subNotebookIds = (yield query.execute()).map((ref) => ref.id);
                (0, array_js_1.deleteItems)(subNotebookIds, ...ids);
                if (subNotebookIds.length > 0)
                    yield this.db.trash.add("notebook", subNotebookIds, "app");
                yield this.db.trash.add("notebook", ids, "user");
            }));
        });
    }
    remove(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                yield this.db.relations.unlinkOfType("notebook", ids);
                yield this.collection.softDelete(ids);
            }));
        });
    }
    parentId(id) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const relation = yield this.db.relations
                .to({
                id: id,
                type: "notebook"
            }, "notebook")
                .get();
            return (_a = relation[0]) === null || _a === void 0 ? void 0 : _a.fromId;
        });
    }
}
exports.Notebooks = Notebooks;
function withSubNotebooks(db, ids, excluded) {
    return db.withRecursive(`subNotebooks(id, path, rootId)`, (eb) => eb
        .selectFrom(() => (0, kysely_1.sql) `(VALUES ${kysely_1.sql.join(ids.map((id) => kysely_1.sql.raw(`('${id}', '${id}', '${id}')`)))})`.as("roots"))
        .selectAll()
        .unionAll((eb) => eb
        .selectFrom(["relations", "subNotebooks"])
        .select([
        "relations.toId as id",
        // Concatenate parent path with current id
        (0, kysely_1.sql) `subNotebooks.path || '/' || relations.toId`.as("path"),
        // Preserve original root
        "subNotebooks.rootId as rootId"
    ])
        .where("toType", "==", "notebook")
        .where("fromType", "==", "notebook")
        .whereRef("fromId", "==", "subNotebooks.id")
        .where("toId", "not in", excluded)
        // Use path to prevent cycles
        .where("subNotebooks.path", "not like", (0, kysely_1.sql) `'%' || relations.toId || '%'`)
        .$narrowType()));
}
