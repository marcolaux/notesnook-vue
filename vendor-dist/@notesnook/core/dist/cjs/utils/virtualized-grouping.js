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
exports.VirtualizedGrouping = void 0;
const CACHE_SIZE = 2;
class VirtualizedGrouping {
    constructor(length, batchSize, ids, fetchItems, groupItems, groups) {
        this.length = length;
        this.batchSize = batchSize;
        this.ids = ids;
        this.fetchItems = fetchItems;
        this.groupItems = groupItems;
        this.groups = groups;
        this.cache = new Map();
        this.pending = new Map();
        this._placeholders = [];
    }
    get placeholders() {
        if (this._placeholders.length !== this.length) {
            this._placeholders = new Array(this.length).fill(true);
        }
        return this._placeholders;
    }
    key(index) {
        return `${index}`;
    }
    type(index) {
        const batchIndex = Math.floor(index / this.batchSize);
        const batch = this.cache.get(batchIndex);
        if (!batch)
            return "item";
        const { items, groups } = batch;
        const itemIndexInBatch = index - batchIndex * this.batchSize;
        const group = groups === null || groups === void 0 ? void 0 : groups.get(itemIndexInBatch);
        return group && !group.hidden && items[itemIndexInBatch]
            ? "header-item"
            : "item";
    }
    cacheItem(index) {
        const batchIndex = Math.floor(index / this.batchSize);
        const batch = this.cache.get(batchIndex);
        if (!batch)
            return;
        const { items, groups, data } = batch;
        const itemIndexInBatch = index - batchIndex * this.batchSize;
        const group = groups === null || groups === void 0 ? void 0 : groups.get(itemIndexInBatch);
        return {
            item: items[itemIndexInBatch],
            group: group && !group.hidden ? group.group : undefined,
            data: data === null || data === void 0 ? void 0 : data[itemIndexInBatch]
        };
    }
    item(index, operate) {
        return __awaiter(this, void 0, void 0, function* () {
            const batchIndex = Math.floor(index / this.batchSize);
            const { items, groups, data } = this.cache.get(batchIndex) ||
                (yield this.batchLoader(batchIndex, operate));
            const itemIndexInBatch = index - batchIndex * this.batchSize;
            const group = groups === null || groups === void 0 ? void 0 : groups.get(itemIndexInBatch);
            return {
                item: items[itemIndexInBatch],
                group: group && !group.hidden ? group.group : undefined,
                data: data === null || data === void 0 ? void 0 : data[itemIndexInBatch]
            };
        });
    }
    /**
     *
     * @param index
     */
    load(batchIndex, operate) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const [lastBatchIndex, lastBatch] = lastInMap(this.cache) || [];
            const direction = lastBatchIndex !== undefined && lastBatchIndex < batchIndex
                ? "down"
                : "up";
            const start = batchIndex * this.batchSize;
            const end = start + this.batchSize;
            const { ids, items } = yield this.fetchItems(start, end);
            const groups = (_a = this.groupItems) === null || _a === void 0 ? void 0 : _a.call(this, items);
            if (items.length > this.batchSize)
                throw new Error("Got more items than the batch size.");
            if (direction === "down") {
                const [, firstGroup] = groups ? firstInMap(groups) : [];
                const group = (lastBatch === null || lastBatch === void 0 ? void 0 : lastBatch.groups)
                    ? lastInMap(lastBatch.groups)[1]
                    : undefined;
                if (group && firstGroup && group.group.title === firstGroup.group.title)
                    firstGroup.hidden = true;
            }
            else {
                const prevGroups = this.groupItems && start > 0
                    ? this.groupItems((yield this.fetchItems(start - 1, start)).items)
                    : undefined;
                if (prevGroups && groups) {
                    const [, prevGroup] = lastInMap(prevGroups);
                    const [, group] = firstInMap(groups);
                    if (group && (prevGroup === null || prevGroup === void 0 ? void 0 : prevGroup.group.title) === (group === null || group === void 0 ? void 0 : group.group.title))
                        group.hidden = true;
                }
            }
            const batch = {
                items,
                groups,
                data: operate ? yield operate(ids, items) : undefined
            };
            this.cache.set(batchIndex, batch);
            this.clear();
            return batch;
        });
    }
    batchLoader(batch, operate) {
        if (this.pending.has(batch))
            return this.pending.get(batch);
        const promise = this.load(batch, operate);
        this.pending.set(batch, promise);
        return promise.finally(() => {
            this.pending.delete(batch);
        });
    }
    clear() {
        if (this.cache.size <= CACHE_SIZE)
            return;
        for (const [key] of this.cache) {
            this.cache.delete(key);
            if (this.cache.size === CACHE_SIZE)
                break;
        }
    }
}
exports.VirtualizedGrouping = VirtualizedGrouping;
function lastInMap(map) {
    let i = 0;
    for (const item of map) {
        if (++i === map.size)
            return item;
    }
    return [undefined, undefined];
}
function firstInMap(map) {
    let i = 0;
    for (const item of map) {
        if (++i === 1)
            return item;
    }
    return [undefined, undefined];
}
