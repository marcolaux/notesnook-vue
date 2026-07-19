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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_js_1 = require("../common.js");
const migrations_js_1 = require("../migrations.js");
const types_js_1 = require("../types.js");
const indexed_collection_js_1 = require("./indexed-collection.js");
const sql_collection_js_1 = require("./sql-collection.js");
const logger_js_1 = require("../logger.js");
class Migrator {
    migrate(db, collections, version) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            if (version <= 5.9) {
                const vaultKey = yield db.storage().read("vaultKey");
                if (vaultKey)
                    yield (0, migrations_js_1.migrateVaultKey)(db, vaultKey, version, common_js_1.CURRENT_DATABASE_VERSION);
                yield (0, migrations_js_1.migrateKV)(db, version, common_js_1.CURRENT_DATABASE_VERSION);
            }
            for (const collection of collections) {
                (0, common_js_1.sendMigrationProgressEvent)(db.eventManager, collection.name, 0, 0);
                const table = new sql_collection_js_1.SQLCollection(db.sql, db.transaction, collection.table, db.eventManager, db.sanitizer);
                if (version <= 5.9) {
                    if (collection.name === "settings") {
                        const settings = yield db
                            .storage()
                            .read("settings");
                        if (!settings)
                            continue;
                        yield (0, migrations_js_1.migrateItem)(settings, version, common_js_1.CURRENT_DATABASE_VERSION, "settings", db, "local");
                        yield db.storage().remove("settings");
                    }
                    else {
                        const indexedCollection = new indexed_collection_js_1.IndexedCollection(db.storage, collection.name);
                        yield (0, migrations_js_1.migrateCollection)(indexedCollection, version);
                        yield indexedCollection.init();
                        yield table.init();
                        let count = 0;
                        try {
                            for (var _d = true, _e = (e_1 = void 0, __asyncValues(indexedCollection.iterate(100))), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                                _c = _f.value;
                                _d = false;
                                const entries = _c;
                                yield this.migrateToSQLite(db, table, entries.map((i) => i[1]), version);
                                (0, common_js_1.sendMigrationProgressEvent)(db.eventManager, collection.name, indexedCollection.indexer.indices.length, (count += 100));
                            }
                        }
                        catch (e_1_1) { e_1 = { error: e_1_1 }; }
                        finally {
                            try {
                                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                            }
                            finally { if (e_1) throw e_1.error; }
                        }
                        yield indexedCollection.clear();
                    }
                }
                else {
                    yield table.init();
                    yield this.migrateItems(db, table, collection.name, version);
                }
            }
            yield db.initCollections();
            return true;
        });
    }
    migrateToSQLite(db, table, items, version) {
        return __awaiter(this, void 0, void 0, function* () {
            const toAdd = [];
            for (let i = 0; i < items.length; ++i) {
                const item = items[i];
                // can be true due to corrupted data.
                if (Array.isArray(item)) {
                    logger_js_1.logger.debug("Skipping item during migration to SQLite", {
                        table,
                        version,
                        item
                    });
                    continue;
                }
                if (!item)
                    continue;
                let migrated = yield (0, migrations_js_1.migrateItem)(item, version, common_js_1.CURRENT_DATABASE_VERSION, (0, types_js_1.isDeleted)(item) ? "never" : item.type, db, "local");
                // trash item is also a notebook or a note so we have to migrate it separately.
                if ((0, types_js_1.isTrashItem)(item)) {
                    migrated = yield (0, migrations_js_1.migrateItem)(item, version, common_js_1.CURRENT_DATABASE_VERSION, item.itemType, db, "local");
                }
                if (migrated !== "skip")
                    toAdd.push(item);
            }
            if (toAdd.length > 0) {
                yield table.put(toAdd);
            }
        });
    }
    migrateItems(db, table, type, version) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_2, _b, _c;
            let progress = 0;
            let toAdd = [];
            let toDelete = [];
            try {
                for (var _d = true, _e = __asyncValues(table.stream(100)), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const item = _c;
                    if (toAdd.length >= 500) {
                        yield table.put(toAdd);
                        yield table.delete(toDelete);
                        progress += toAdd.length;
                        (0, common_js_1.sendMigrationProgressEvent)(db.eventManager, type, progress, progress);
                        toAdd = [];
                        toDelete = [];
                    }
                    const itemId = item.id;
                    let migrated = yield (0, migrations_js_1.migrateItem)(item, version, common_js_1.CURRENT_DATABASE_VERSION, (0, types_js_1.isDeleted)(item) ? "never" : item.type || "never", db, "local");
                    // trash item is also a notebook or a note so we have to migrate it separately.
                    if ((0, types_js_1.isTrashItem)(item)) {
                        migrated = yield (0, migrations_js_1.migrateItem)(item, version, common_js_1.CURRENT_DATABASE_VERSION, item.itemType, db, "local");
                    }
                    if (!migrated || migrated === "skip")
                        continue;
                    toAdd.push(item);
                    // if id changed after migration, we need to delete the old one.
                    if (item.id !== itemId) {
                        toDelete.push(itemId);
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                }
                finally { if (e_2) throw e_2.error; }
            }
            yield table.put(toAdd);
            yield table.delete(toDelete);
            progress += toAdd.length;
            (0, common_js_1.sendMigrationProgressEvent)(db.eventManager, type, progress, progress);
            toAdd = [];
            toDelete = [];
        });
    }
}
exports.default = Migrator;
