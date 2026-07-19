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
exports.Monographs = void 0;
const sql_collection_js_1 = require("../database/sql-collection.js");
const id_js_1 = require("../utils/id.js");
const index_js_1 = require("../database/index.js");
class Monographs {
    constructor(db) {
        this.db = db;
        this.name = "monographs";
        this.collection = new sql_collection_js_1.SQLCollection(db.sql, db.transaction, "monographs", db.eventManager, db.sanitizer);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
        });
    }
    get all() {
        var _a;
        return this.collection.createFilter((qb) => qb.where((0, index_js_1.isFalse)("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    add(monograph) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = monograph.id || (0, id_js_1.getId)();
            const oldMonograph = yield this.collection.get(id);
            const merged = Object.assign(Object.assign({}, oldMonograph), monograph);
            yield this.collection.upsert({
                id,
                title: merged.title,
                datePublished: merged.datePublished,
                selfDestruct: merged.selfDestruct,
                password: merged.password,
                publishUrl: merged.publishUrl,
                type: "monograph"
            });
        });
    }
}
exports.Monographs = Monographs;
