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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
import { CURRENT_DATABASE_VERSION, EVENTS } from "../../common.js";
import { logger } from "../../logger.js";
import { SYNC_COLLECTIONS_MAP, SYNC_ITEM_TYPES } from "./types.js";
class Collector {
    constructor(db) {
        this.db = db;
        this.logger = logger.scope("SyncCollector");
    }
    hasUnsyncedChanges() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const itemType of SYNC_ITEM_TYPES) {
                const collectionKey = SYNC_COLLECTIONS_MAP[itemType];
                const collection = this.db[collectionKey].collection;
                if ((yield collection.unsyncedCount()) > 0)
                    return true;
            }
            return false;
        });
    }
    collect(chunkSize_1) {
        return __asyncGenerator(this, arguments, function* collect_1(chunkSize, isForceSync = false) {
            var _a, e_1, _b, _c;
            const keys = yield __await(this.db.user.getDataEncryptionKeys());
            if (!keys || !keys.length) {
                this.db.eventManager.publish(EVENTS.userSessionExpired);
                throw new Error("User encryption key not generated. Please relogin.");
            }
            // select the latest available key for encryption
            const key = keys.reduce((max, current) => current.version > max.version ? current : max);
            for (const itemType of SYNC_ITEM_TYPES) {
                const collectionKey = SYNC_COLLECTIONS_MAP[itemType];
                const collection = this.db[collectionKey].collection;
                let pushTimestamp = Date.now();
                try {
                    for (var _d = true, _e = (e_1 = void 0, __asyncValues(collection.unsynced(chunkSize, isForceSync))), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                        _c = _f.value;
                        _d = false;
                        const chunk = _c;
                        const { ids, items: syncableItems } = filterSyncableItems(chunk);
                        if (!ids.length)
                            continue;
                        const ciphers = yield __await(this.db
                            .storage()
                            .encryptMulti(key.key, syncableItems));
                        const items = toSyncItem(ids, ciphers, key.version);
                        this.logger.debug(`Collected ${items.length} items for type ${itemType}`, { ids });
                        yield yield __await({ items, type: itemType, count: items.length });
                        yield __await(this.db
                            .sql()
                            .updateTable(collection.type)
                            .where("id", "in", ids)
                            // EDGE CASE:
                            // Sometimes an item can get updated while it's being pushed.
                            // The result is that its `synced` property becomes true even
                            // though it's modification wasn't yet synced.
                            // In order to prevent that, we only set the `synced` property
                            // to true for items that haven't been modified since we last ran
                            // the push. Everything else will be collected again in the next
                            // push.
                            .where("dateModified", "<=", pushTimestamp)
                            .set({ synced: true })
                            .execute());
                        pushTimestamp = Date.now();
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
        });
    }
}
export default Collector;
function toSyncItem(ids, ciphers, keyVersion) {
    if (ids.length !== ciphers.length)
        throw new Error("ids.length must be equal to ciphers.length");
    const items = [];
    for (let i = 0; i < ids.length; ++i) {
        const id = ids[i];
        const cipher = ciphers[i];
        cipher.v = CURRENT_DATABASE_VERSION;
        cipher.id = id;
        cipher.keyVersion = keyVersion;
        items.push(cipher);
    }
    return items;
}
function filterSyncableItems(items) {
    if (!items || !items.length)
        return { items: [], ids: [] };
    const ids = [];
    const syncableItems = [];
    for (const item of items) {
        delete item.synced;
        ids.push(item.id);
        syncableItems.push(JSON.stringify("localOnly" in item && item.localOnly
            ? {
                id: item.id,
                deleted: true,
                dateModified: item.dateModified
            }
            : item));
    }
    return { items: syncableItems, ids };
}
