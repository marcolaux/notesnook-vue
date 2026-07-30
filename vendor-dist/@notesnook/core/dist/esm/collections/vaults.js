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
import { getId } from "../utils/id.js";
import { isFalse } from "../database/index.js";
export class Vaults {
    constructor(db) {
        this.db = db;
        this.name = "vaults";
        this.collection = new SQLCollection(db.sql, db.transaction, "vaults", db.eventManager, db.sanitizer);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
        });
    }
    add(item) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = item.id || getId();
            const oldVault = item.id ? yield this.vault(item.id) : undefined;
            if (!item.title && !(oldVault === null || oldVault === void 0 ? void 0 : oldVault.title))
                throw new Error("Title is required.");
            yield this.collection.upsert({
                id,
                dateCreated: item.dateCreated || (oldVault === null || oldVault === void 0 ? void 0 : oldVault.dateCreated) || Date.now(),
                dateModified: item.dateModified || (oldVault === null || oldVault === void 0 ? void 0 : oldVault.dateModified) || Date.now(),
                title: item.title || (oldVault === null || oldVault === void 0 ? void 0 : oldVault.title) || "",
                key: item.key,
                type: "vault"
            });
            return id;
        });
    }
    remove(id) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.db.transaction(() => __awaiter(this, void 0, void 0, function* () {
                yield this.db.relations.unlinkOfType("vault", [id]);
                yield this.collection.softDelete([id]);
            }));
        });
    }
    vault(id) {
        return this.collection.get(id);
    }
    /**
     * This is temporary until we add proper support for multiple vaults
     * @deprecated
     */
    default() {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.all.items())[0];
        });
    }
    get all() {
        var _a;
        return this.collection.createFilter((qb) => qb.where(isFalse("deleted")), (_a = this.db.options) === null || _a === void 0 ? void 0 : _a.batchSize);
    }
    itemExists(reference) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.db.relations.to(reference, "vault").count()) > 0;
        });
    }
    removeAll() {
        return __awaiter(this, void 0, void 0, function* () {
            const vaults = yield this.all.items();
            for (const vault of vaults) {
                yield this.remove(vault.id);
            }
        });
    }
}
