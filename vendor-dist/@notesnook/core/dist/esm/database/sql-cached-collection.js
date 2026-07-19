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
import { isDeleted } from "../types.js";
import { SQLCollection } from "./sql-collection.js";
export class SQLCachedCollection {
    constructor(sql, startTransaction, type, eventManager, sanitizer) {
        this.type = type;
        this.cache = new Map();
        this.collection = new SQLCollection(sql, startTransaction, type, eventManager, sanitizer);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
            const records = yield this.collection.records([]);
            this.cache = new Map(Object.entries(records));
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.clear();
            this.cache.clear();
        });
    }
    upsert(item) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.upsert(item);
            this.cache.set(item.id, item);
        });
    }
    delete(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            ids.forEach((id) => this.cache.delete(id));
            yield this.collection.delete(ids);
        });
    }
    softDelete(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            ids.forEach((id) => this.cache.set(id, {
                id,
                deleted: true,
                dateModified: Date.now(),
                synced: false
            }));
            yield this.collection.softDelete(ids);
        });
    }
    exists(id) {
        const item = this.cache.get(id);
        return !!item && !isDeleted(item);
    }
    count() {
        return this.cache.size;
    }
    get(id) {
        const item = this.cache.get(id);
        if (!item || isDeleted(item))
            return;
        return item;
    }
    put(items) {
        return __awaiter(this, void 0, void 0, function* () {
            const entries = yield this.collection.put(items);
            for (const item of entries) {
                this.cache.set(item.id, item);
            }
            return entries;
        });
    }
    update(ids, partial) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.update(ids, partial);
            for (const id of ids) {
                const item = this.cache.get(id);
                if (!item)
                    continue;
                this.cache.set(id, Object.assign(Object.assign(Object.assign({}, item), partial), { dateModified: Date.now() }));
            }
        });
    }
    records(ids) {
        const items = {};
        for (const id of ids) {
            items[id] = this.cache.get(id);
        }
        return items;
    }
    items(ids) {
        const items = [];
        if (ids) {
            for (const id of ids) {
                const item = this.cache.get(id);
                if (!item || isDeleted(item))
                    continue;
                items.push(item);
            }
        }
        else {
            for (const [_key, value] of this.cache) {
                if (!value || isDeleted(value))
                    continue;
                items.push(value);
            }
        }
        return items;
    }
    *unsynced(chunkSize) {
        let chunk = [];
        for (const [_key, value] of this.cache) {
            if (value && !value.synced) {
                chunk.push(value);
                if (chunk.length === chunkSize) {
                    yield chunk;
                    chunk = [];
                }
            }
        }
        if (chunk.length > 0)
            yield chunk;
    }
    *stream() {
        for (const [_key, value] of this.cache) {
            if (value && !value.deleted)
                yield value;
        }
    }
    unsyncedCount() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.collection.unsyncedCount();
        });
    }
    invalidateCache() {
        this.cache.clear();
    }
}
