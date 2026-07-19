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
import { IndexedCollection } from "./indexed-collection.js";
import { isDeleted } from "../types.js";
/**
 * @deprecated only kept here for migration purposes
 */
export class CachedCollection {
    constructor(storage, type) {
        this.cache = new Map();
        this.collection = new IndexedCollection(storage, type);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.init();
            const data = yield this.collection.indexer.readMulti(this.collection.indexer.indices);
            this.cache = new Map(data);
        });
    }
    add(item) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.addItem(item);
            this.cache.set(item.id, item);
            this.invalidateCache();
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.collection.clear();
            this.cache.clear();
            this.invalidateCache();
        });
    }
    exists(id) {
        const item = this.cache.get(id);
        return this.collection.exists(id) && !!item && !isDeleted(item);
    }
    has(id) {
        return this.cache.has(id);
    }
    count() {
        return this.cache.size;
    }
    delete(id) {
        return __awaiter(this, void 0, void 0, function* () {
            this.cache.delete(id);
            yield this.collection.deleteItem(id);
            this.invalidateCache();
        });
    }
    items(map) {
        if (this.cachedItems && this.cachedItems.length === this.cache.size)
            return this.cachedItems;
        this.cachedItems = [];
        this.cache.forEach((value) => {
            var _a;
            if (isDeleted(value))
                return;
            const mapped = map ? map(value) : value;
            if (!mapped)
                return;
            (_a = this.cachedItems) === null || _a === void 0 ? void 0 : _a.push(mapped);
        });
        this.cachedItems.sort((a, b) => b.dateCreated - a.dateCreated);
        return this.cachedItems;
    }
    get(id) {
        const item = this.cache.get(id);
        if (!item || isDeleted(item))
            return;
        return item;
    }
    invalidateCache() {
        this.cachedItems = undefined;
    }
}
