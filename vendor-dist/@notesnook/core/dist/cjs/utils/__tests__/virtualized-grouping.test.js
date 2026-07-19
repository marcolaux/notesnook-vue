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
const vitest_1 = require("vitest");
const virtualized_grouping_js_1 = require("../virtualized-grouping.js");
const grouping_js_1 = require("../grouping.js");
function generateItems(length, groupSize) {
    const items = [];
    const ids = [];
    const divider = length / groupSize;
    for (let i = 0; i < length; ++i) {
        items.push({ group: `${i % divider}`, id: `${i}` });
        ids.push(`${i}`);
    }
    items.sort((a, b) => a.group.localeCompare(b.group));
    return { items, ids };
}
function createVirtualizedGrouping(length, groupSize, batchSize) {
    const { ids, items } = generateItems(length, groupSize);
    return new virtualized_grouping_js_1.VirtualizedGrouping(items.length, batchSize, () => Promise.resolve(ids), (start, end) => __awaiter(this, void 0, void 0, function* () {
        return ({
            ids: ids.slice(start, end),
            items: items.slice(start, end)
        });
    }), (items) => (0, grouping_js_1.groupArray)(items, (item) => item.group));
}
(0, vitest_1.test)("load first batch with a single group", (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const grouping = createVirtualizedGrouping(100, 10, 10);
    t.expect((_a = (yield grouping.item(0)).group) === null || _a === void 0 ? void 0 : _a.title).toBe("0");
    for (let i = 1; i < 10; ++i)
        t.expect((_c = (_b = grouping.cacheItem(i)) === null || _b === void 0 ? void 0 : _b.group) === null || _c === void 0 ? void 0 : _c.title).toBeUndefined();
}));
(0, vitest_1.test)("load first batch with a multiple groups", (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const grouping = createVirtualizedGrouping(100, 2, 10);
    t.expect((_a = (yield grouping.item(0)).group) === null || _a === void 0 ? void 0 : _a.title).toBe(`0`);
    t.expect((_c = (_b = grouping.cacheItem(2)) === null || _b === void 0 ? void 0 : _b.group) === null || _c === void 0 ? void 0 : _c.title).toBe(`1`);
    t.expect((_e = (_d = grouping.cacheItem(4)) === null || _d === void 0 ? void 0 : _d.group) === null || _e === void 0 ? void 0 : _e.title).toBe(`10`);
    t.expect((_g = (_f = grouping.cacheItem(6)) === null || _f === void 0 ? void 0 : _f.group) === null || _g === void 0 ? void 0 : _g.title).toBe(`11`);
    t.expect((_j = (_h = grouping.cacheItem(8)) === null || _h === void 0 ? void 0 : _h.group) === null || _j === void 0 ? void 0 : _j.title).toBe(`12`);
}));
(0, vitest_1.test)("load last batch with a single group", (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const grouping = createVirtualizedGrouping(100, 10, 10);
    t.expect((_a = (yield grouping.item(90)).group) === null || _a === void 0 ? void 0 : _a.title).toBe("9");
    for (let i = 91; i < 100; ++i)
        t.expect((_c = (_b = grouping.cacheItem(i)) === null || _b === void 0 ? void 0 : _b.group) === null || _c === void 0 ? void 0 : _c.title).toBeUndefined();
}));
(0, vitest_1.test)("load last batch with a multiple groups", (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const grouping = createVirtualizedGrouping(100, 2, 10);
    t.expect((_a = (yield grouping.item(90)).group) === null || _a === void 0 ? void 0 : _a.title).toBe(`5`);
    t.expect((_c = (_b = grouping.cacheItem(92)) === null || _b === void 0 ? void 0 : _b.group) === null || _c === void 0 ? void 0 : _c.title).toBe(`6`);
    t.expect((_e = (_d = grouping.cacheItem(94)) === null || _d === void 0 ? void 0 : _d.group) === null || _e === void 0 ? void 0 : _e.title).toBe(`7`);
    t.expect((_g = (_f = grouping.cacheItem(96)) === null || _f === void 0 ? void 0 : _f.group) === null || _g === void 0 ? void 0 : _g.title).toBe(`8`);
    t.expect((_j = (_h = grouping.cacheItem(98)) === null || _h === void 0 ? void 0 : _h.group) === null || _j === void 0 ? void 0 : _j.title).toBe(`9`);
}));
(0, vitest_1.test)("group spanning multiple batches (down)", (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const grouping = createVirtualizedGrouping(140, 14, 10);
    t.expect((_a = (yield grouping.item(0)).group) === null || _a === void 0 ? void 0 : _a.title).toBe(`0`);
    t.expect((yield grouping.item(12)).group).toBeUndefined();
    t.expect((_b = (yield grouping.item(14)).group) === null || _b === void 0 ? void 0 : _b.title).toBe("1");
    t.expect((yield grouping.item(24)).group).toBeUndefined();
    t.expect((_c = (yield grouping.item(28)).group) === null || _c === void 0 ? void 0 : _c.title).toBe("2");
}));
(0, vitest_1.test)("single group in all batches", (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const grouping = createVirtualizedGrouping(100, 100, 10);
    t.expect((_a = (yield grouping.item(0)).group) === null || _a === void 0 ? void 0 : _a.title).toBe(`0`);
    for (let i = 1; i < 100; ++i) {
        t.expect((yield grouping.item(i)).group).toBeUndefined();
    }
}));
(0, vitest_1.test)("group at start of each batch", (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const grouping = createVirtualizedGrouping(100, 10, 10);
    for (let i = 0; i < 100; i += 10) {
        t.expect((_a = (yield grouping.item(i)).group) === null || _a === void 0 ? void 0 : _a.title).toBe(`${i / 10}`);
    }
}));
(0, vitest_1.test)("group spanning multiple batches (up)", (t) => __awaiter(void 0, void 0, void 0, function* () {
    const grouping = createVirtualizedGrouping(140, 28, 10);
    t.expect((yield grouping.item(130)).group).toBeUndefined();
    t.expect((yield grouping.item(120)).group).toBeUndefined();
    t.expect((yield grouping.item(140 - 28)).group).toBeDefined();
    t.expect((yield grouping.item(110)).group).toBeUndefined();
}));
