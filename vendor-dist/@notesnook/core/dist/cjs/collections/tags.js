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
exports.Tags = void 0;
exports.sanitizeTag = sanitizeTag;
const id_js_1 = require("../utils/id.js");
const sql_collection_js_1 = require("../database/sql-collection.js");
const index_js_1 = require("../database/index.js");
const kysely_1 = require("@streetwriters/kysely");
class Tags {
    constructor(db) {
        this.db = db;
        this.name = "tags";
        this.collection = new sql_collection_js_1.SQLCollection(db.sql, db.transaction, "tags", db.eventManager, db.sanitizer);
    }
    init() {
        return this.collection.init();
    }
    /**
     * Required to satisfy the ICollection interface.
     * This collection does not currently maintain a local cache that needs invalidation,
     * but the method must exist for type safety when iterating over all collections.
     */
    invalidateCache() { }
    tag(id) {
        return this.collection.get(id);
    }
    find(title) {
        return this.all.find((0, kysely_1.sql) `title == ${title} COLLATE BINARY`);
    }
    add(item) {
        return __awaiter(this, void 0, void 0, function* () {
            item.title = sanitizeTag(item.title);
            const oldTag = item.id ? yield this.tag(item.id) : undefined;
            if (oldTag && item.title === oldTag.title)
                return oldTag.id;
            if (yield this.find(item.title))
                throw new Error("Tag with this title already exists.");
            if (oldTag) {
                yield this.collection.update([oldTag.id], item);
                return oldTag.id;
            }
            const id = item.id || (0, id_js_1.getId)();
            yield this.collection.upsert({
                id,
                dateCreated: item.dateCreated || Date.now(),
                dateModified: item.dateModified || Date.now(),
                title: item.title,
                type: "tag"
            });
            return id;
        });
    }
    // get raw() {
    //   return this.collection.raw();
    // }
    get all() {
        var _a;
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    remove(...ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                yield this.db.relations.unlinkOfType("tag", ids);
                yield this.collection.softDelete(ids);
            }));
        });
    }
    exists(id) {
        return this.collection.exists(id);
    }
}
exports.Tags = Tags;
function sanitizeTag(title) {
    return title.replace(/^\s+|\s+$/gm, "");
}
