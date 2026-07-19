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
exports.Relations = void 0;
const id_js_1 = require("../utils/id.js");
const sql_collection_js_1 = require("../database/sql-collection.js");
const index_js_1 = require("../database/index.js");
const common_js_1 = require("../common.js");
class Relations {
    constructor(db) {
        this.db = db;
        this.name = "relations";
        this.fromCache = new Map();
        this.toCache = new Map();
        this.collection = new sql_collection_js_1.SQLCollection(db.sql, db.transaction, "relations", db.eventManager, db.sanitizer);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            // await this.buildCache();
            yield this.collection.init();
        });
    }
    add(from, to) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!from.id || !to.id)
                throw new Error("Invalid item reference.");
            yield this.collection.upsert({
                id: generateId(from, to),
                type: "relation",
                dateCreated: Date.now(),
                dateModified: Date.now(),
                fromId: from.id,
                fromType: from.type,
                toId: to.id,
                toType: to.type
            });
        });
    }
    from(reference, type) {
        return new RelationsArray(this.db, reference, type ? (Array.isArray(type) ? type : [type]) : undefined, "from");
    }
    to(reference, type) {
        return new RelationsArray(this.db, reference, type ? (Array.isArray(type) ? type : [type]) : undefined, "to");
    }
    buildCache() {
        return __awaiter(this, void 0, void 0, function* () {
            console.time("cache build");
            this.fromCache.clear();
            this.toCache.clear();
            console.time("query");
            const relations = yield this.db
                .sql()
                .selectFrom("relations")
                .select(["toId", "fromId"])
                .$narrowType()
                .execute();
            console.timeEnd("query");
            for (const { fromId, toId } of relations) {
                const fromIds = this.fromCache.get(fromId) || [];
                fromIds.push(toId);
                this.fromCache.set(fromId, fromIds);
                const toIds = this.toCache.get(toId) || [];
                toIds.push(fromId);
                this.toCache.set(toId, toIds);
            }
            console.timeEnd("cache build");
        });
    }
    // get raw() {
    //   return this.collection.raw();
    // }
    // get all(): Relation[] {
    //   return this.collection.items();
    // }
    // relation(id: string) {
    //   return this.collection.get(id);
    // }
    remove(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.softDelete(ids);
        });
    }
    unlink(from, to) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.remove(generateId(from, to));
            this.db.eventManager.publish(common_js_1.EVENTS.databaseUpdated, {
                collection: "relations",
                type: "unlink",
                reference: to,
                direction: "from",
                types: [from.type]
            });
        });
    }
    unlinkOfType(type, ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db
                .sql()
                .replaceInto("relations")
                .columns(["id", "dateModified", "deleted", "synced"])
                .expression((eb) => eb
                .selectFrom("relations")
                .where((eb) => eb.or([eb("fromType", "==", type), eb("toType", "==", type)]))
                .$if(ids !== undefined && ids.length > 0, (eb) => eb.where((eb) => eb.or([eb("fromId", "in", ids), eb("toId", "in", ids)])))
                .select((eb) => [
                "relations.id",
                eb.lit(Date.now()).as("dateModified"),
                eb.lit(1).as("deleted"),
                eb.lit(0).as("synced")
            ]))
                .execute();
            this.db.eventManager.publish(common_js_1.EVENTS.databaseUpdated, {
                collection: "relations",
                type: "unlink",
                reference: { type: type, ids: ids || [] },
                direction: "from",
                types: Object.keys(TABLE_MAP)
            });
            this.db.eventManager.publish(common_js_1.EVENTS.databaseUpdated, {
                collection: "relations",
                type: "unlink",
                reference: { type: type, ids: ids || [] },
                direction: "to",
                types: Object.keys(TABLE_MAP)
            });
        });
    }
}
exports.Relations = Relations;
/**
 *
 * @param {ItemReference} a
 * @param {ItemReference} b
 */
function compareItemReference(a, b) {
    return a.id === b.id && a.type === b.type;
}
/**
 * Generate deterministic constant id from `a` & `b` item reference.
 * @param {ItemReference} a
 * @param {ItemReference} b
 */
function generateId(a, b) {
    const str = `${a.id}${b.id}${a.type}${b.type}`;
    return (0, id_js_1.makeId)(str);
}
const TABLE_MAP = {
    note: "notes",
    notebook: "notebooks",
    reminder: "reminders",
    tag: "tags",
    color: "colors",
    attachment: "attachments",
    vault: "vaults"
};
class RelationsArray {
    constructor(db, reference, types, direction) {
        this.db = db;
        this.reference = reference;
        this.types = types;
        this.direction = direction;
    }
    get selector() {
        var _a;
        if (!this.types)
            throw new Error("Cannot use selector when no tables are specified.");
        if (this.types.length > 1)
            throw new Error("Cannot use selector when more than 1 tables are specified.");
        const table = TABLE_MAP[this.types[0]];
        return new sql_collection_js_1.FilteredSelector(table, this.db
            .sql()
            .selectFrom(table)
            .where("id", "in", (b) => b
            .selectFrom("relations")
            .$call((eb) => this.buildRelationsQuery()(eb)))
            // TODO: check if we need to index deleted field.
            .where((0, index_js_1.isFalse)("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    resolve(limit) {
        return __awaiter(this, void 0, void 0, function* () {
            const items = yield this.selector.filter
                .$if(limit !== undefined && limit > 0, (b) => b.limit(limit))
                .selectAll()
                .execute();
            return items;
        });
    }
    unlink() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db
                .sql()
                .replaceInto("relations")
                .columns(["id", "dateModified", "deleted", "synced"])
                .expression((eb) => eb
                .selectFrom("relations")
                .$call(this.buildRelationsQuery())
                .clearSelect()
                .select((eb) => [
                "relations.id",
                eb.lit(Date.now()).as("dateModified"),
                eb.lit(true).as("deleted"),
                eb.lit(false).as("synced")
            ]))
                .execute();
            this.db.eventManager.publish(common_js_1.EVENTS.databaseUpdated, {
                collection: "relations",
                type: "unlink",
                reference: this.reference,
                direction: this.direction,
                types: this.types
            });
        });
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            const relations = yield this.db
                .sql()
                .selectFrom("relations")
                .$call(this.buildRelationsQuery())
                .clearSelect()
                .select(["fromId", "toId", "fromType", "toType"])
                .$narrowType()
                .execute();
            return relations;
        });
    }
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.db
                .sql()
                .selectFrom("relations")
                .$call(this.buildRelationsQuery())
                .clearSelect()
                .select((b) => b.fn.count("relations.id").as("count"))
                .executeTakeFirst();
            if (!result)
                return 0;
            return result.count;
        });
    }
    has(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.db
                .sql()
                .selectFrom("relations")
                .$call(this.buildRelationsQuery())
                .clearSelect()
                .where(this.direction === "from" ? "toId" : "fromId", "in", ids)
                .select((b) => b.fn.count("id").as("count"))
                .executeTakeFirst();
            if (!result)
                return false;
            return result.count > 0;
        });
    }
    hasAll(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.db
                .sql()
                .selectFrom("relations")
                .$call(this.buildRelationsQuery())
                .clearSelect()
                .where(this.direction === "from" ? "toId" : "fromId", "in", ids)
                .select((b) => b.fn.count("id").as("count"))
                .executeTakeFirst();
            if (!result)
                return false;
            return result.count === ids.length;
        });
    }
    /**
     * Build an optimized query for obtaining relations based on the given
     * parameters. The resulting query uses a covering index (the most
     * optimizable index) for obtaining relations.
     */
    buildRelationsQuery() {
        return (builder) => {
            var _a, _b, _c, _d, _e, _f;
            if (this.direction === "to") {
                return builder
                    .$if(!!this.types, (eb) => eb.where("fromType", this.types.length > 1 ? "in" : "==", this.types.length > 1 ? this.types : this.types[0]))
                    .where("toType", "==", this.reference.type)
                    .where("toId", isItemReferences(this.reference) ? "in" : "==", isItemReferences(this.reference)
                    ? this.reference.ids
                    : this.reference.id)
                    .$if(!!((_a = this.types) === null || _a === void 0 ? void 0 : _a.includes("note")) &&
                    this.db.trash.cache.notes.length > 0, (b) => b.where("fromId", "not in", this.db.trash.cache.notes))
                    .$if(!!((_b = this.types) === null || _b === void 0 ? void 0 : _b.includes("note")) &&
                    this.db.notes.cache.archived.length > 0 &&
                    this.reference.type !== "attachment", (b) => b.where("fromId", "not in", this.db.notes.cache.archived))
                    .$if(!!((_c = this.types) === null || _c === void 0 ? void 0 : _c.includes("notebook")) &&
                    this.db.trash.cache.notebooks.length > 0, (b) => b.where("fromId", "not in", this.db.trash.cache.notebooks))
                    .select("relations.fromId as id")
                    .$narrowType();
            }
            else {
                return builder
                    .$if(!!this.types, (eb) => eb.where("toType", this.types.length > 1 ? "in" : "==", this.types.length > 1 ? this.types : this.types[0]))
                    .where("fromType", "==", this.reference.type)
                    .where("fromId", isItemReferences(this.reference) ? "in" : "==", isItemReferences(this.reference)
                    ? this.reference.ids
                    : this.reference.id)
                    .$if(!!((_d = this.types) === null || _d === void 0 ? void 0 : _d.includes("note")) &&
                    this.db.trash.cache.notes.length > 0, (b) => b.where("toId", "not in", this.db.trash.cache.notes))
                    .$if(!!((_e = this.types) === null || _e === void 0 ? void 0 : _e.includes("note")) &&
                    this.db.notes.cache.archived.length > 0, (b) => b.where("toId", "not in", this.db.notes.cache.archived))
                    .$if(!!((_f = this.types) === null || _f === void 0 ? void 0 : _f.includes("notebook")) &&
                    this.db.trash.cache.notebooks.length > 0, (b) => b.where("toId", "not in", this.db.trash.cache.notebooks))
                    .select("relations.toId as id")
                    .$narrowType();
            }
        };
    }
}
function isItemReferences(ref) {
    return "ids" in ref;
}
