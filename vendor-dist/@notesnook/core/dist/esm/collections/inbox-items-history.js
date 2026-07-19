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
import { SQLCollection } from "../database/sql-collection.js";
import { isFalse } from "../database/index.js";
export class InboxItemsHistory {
    constructor(db) {
        this.db = db;
        this.name = "inboxitemshistory";
        this.collection = new SQLCollection(db.sql, db.transaction, "inboxitemshistory", db.eventManager, db.sanitizer);
    }
    init() {
        return this.collection.init();
    }
    add(item) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            yield this.collection.upsert({
                id: item.id,
                type: "inboxitemhistory",
                dateCreated: now,
                dateModified: now,
                dateSynced: now,
                status: item.status,
                source: item.source,
                errorContext: item.errorContext
            });
            return item.id;
        });
    }
    get failed() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("deleted")).where("status", "==", "failed"), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    delete(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.softDelete(ids);
        });
    }
    deleteFailed() {
        return __awaiter(this, void 0, void 0, function* () {
            const ids = yield this.failed.ids();
            yield this.collection.softDelete(ids);
        });
    }
    exists(id) {
        return this.collection.exists(id);
    }
}
