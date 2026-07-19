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
class Indexer {
    constructor(storage, type) {
        this.storage = storage;
        this.type = type;
        this._indices = [];
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this._indices = (yield this.storage().read(this.type, true)) || [];
        });
    }
    exists(key) {
        return this.indices.includes(key);
    }
    index(key) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.exists(key))
                return;
            this.indices.push(key);
            yield this.storage().write(this.type, this.indices);
        });
    }
    get indices() {
        return this._indices;
    }
    deindex(key) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.exists(key))
                return;
            this.indices.splice(this.indices.indexOf(key), 1);
            yield this.storage().write(this.type, this.indices);
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.storage().removeMulti(this._indices.map((key) => this.makeId(key)));
            this._indices = [];
            yield this.storage().write(this.type, this._indices);
        });
    }
    read(key_1) {
        return __awaiter(this, arguments, void 0, function* (key, isArray = false) {
            return yield this.storage().read(this.makeId(key), isArray);
        });
    }
    write(key, data) {
        return this.storage().write(this.makeId(key), data);
    }
    remove(key) {
        return this.storage().remove(this.makeId(key));
    }
    readMulti(keys) {
        return __awaiter(this, void 0, void 0, function* () {
            const entries = yield this.storage().readMulti(keys.map(this.makeId, this));
            entries.forEach((entry) => {
                entry[0] = entry[0].replace(`_${this.type}`, "");
            });
            return entries;
        });
    }
    /**
     *
     * @param {any[]} items
     * @returns
     */
    writeMulti(items) {
        return __awaiter(this, void 0, void 0, function* () {
            const entries = items.map(([id, item]) => {
                if (!this.indices.includes(id))
                    this.indices.push(id);
                return [this.makeId(id), item];
            });
            entries.push([this.type, this.indices]);
            yield this.storage().writeMulti(entries);
        });
    }
    migrateIndices() {
        return __awaiter(this, void 0, void 0, function* () {
            const keys = (yield this.storage().getAllKeys()).filter((key) => !key.endsWith(`_${this.type}`) && this.exists(key));
            for (const id of keys) {
                const item = yield this.storage().read(id);
                if (!item)
                    continue;
                yield this.write(id, item);
            }
            // remove old ids once they have been moved
            for (const id of keys) {
                yield this.storage().remove(id);
            }
        });
    }
    makeId(id) {
        return `${id}_${this.type}`;
    }
}
exports.default = Indexer;
