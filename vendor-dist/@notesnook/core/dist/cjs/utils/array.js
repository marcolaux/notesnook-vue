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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.findItemAndDelete = findItemAndDelete;
exports.addItem = addItem;
exports.addItems = addItems;
exports.deleteItem = deleteItem;
exports.deleteItems = deleteItems;
exports.findById = findById;
exports.findOrAdd = findOrAdd;
exports.hasItem = hasItem;
exports.toChunks = toChunks;
exports.chunkedIterate = chunkedIterate;
exports.chunkify = chunkify;
function findItemAndDelete(array, predicate) {
    return deleteAtIndex(array, array.findIndex(predicate));
}
function addItem(array, item) {
    const index = array.indexOf(item);
    if (index > -1)
        return false;
    array.push(item);
    return true;
}
function addItems(array, ...items) {
    for (const item of items) {
        addItem(array, item);
    }
    return array;
}
function deleteItem(array, item) {
    return deleteAtIndex(array, array.indexOf(item));
}
function deleteItems(array, ...items) {
    for (const item of items) {
        deleteItem(array, item);
    }
    return array;
}
function findById(array, id) {
    if (!array)
        return false;
    return array.find((item) => item.id === id);
}
function findOrAdd(array, predicate, item) {
    const index = array.findIndex(predicate);
    if (index === -1) {
        array.push(item);
        return item;
    }
    return array[index];
}
function hasItem(array, item) {
    if (!array)
        return false;
    return array.indexOf(item) > -1;
}
function deleteAtIndex(array, index) {
    if (index === -1)
        return false;
    array.splice(index, 1);
    return true;
}
function toChunks(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        const chunk = array.slice(i, i + chunkSize);
        chunks.push(chunk);
    }
    return chunks;
}
function* chunkedIterate(array, chunkSize) {
    for (let i = 0; i < array.length; i += chunkSize) {
        const chunk = array.slice(i, i + chunkSize);
        yield chunk;
    }
}
function chunkify(iterator, chunkSize) {
    return __asyncGenerator(this, arguments, function* chunkify_1() {
        var _a, e_1, _b, _c;
        let chunk = [];
        try {
            for (var _d = true, iterator_1 = __asyncValues(iterator), iterator_1_1; iterator_1_1 = yield __await(iterator_1.next()), _a = iterator_1_1.done, !_a; _d = true) {
                _c = iterator_1_1.value;
                _d = false;
                const item = _c;
                chunk.push(item);
                if (chunk.length === chunkSize) {
                    yield yield __await(chunk);
                    chunk = [];
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = iterator_1.return)) yield __await(_b.call(iterator_1));
            }
            finally { if (e_1) throw e_1.error; }
        }
        if (chunk.length > 0) {
            yield yield __await(chunk);
        }
    });
}
