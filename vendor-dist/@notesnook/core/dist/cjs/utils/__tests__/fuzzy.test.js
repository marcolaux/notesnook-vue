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
Object.defineProperty(exports, "__esModule", { value: true });
const fuzzy_js_1 = require("../fuzzy.js");
const vitest_1 = require("vitest");
(0, vitest_1.describe)("lookup.fuzzy", () => {
    (0, vitest_1.test)("should sort items by score", () => {
        const items = [
            {
                id: "1",
                title: "system"
            },
            {
                id: "2",
                title: "hello"
            },
            {
                id: "3",
                title: "items"
            }
        ];
        const query = "ems";
        (0, vitest_1.expect)((0, fuzzy_js_1.fuzzy)(query, items, (item) => item.id, { title: 1 })).toStrictEqual([
            items[2]
        ]);
    });
    (0, vitest_1.describe)("opts.prefix", () => {
        (0, vitest_1.test)("should prefix matched field with provided value when given", () => {
            const items = [
                {
                    id: "1",
                    title: "hello"
                },
                {
                    id: "2",
                    title: "world"
                }
            ];
            const query = "d";
            (0, vitest_1.expect)((0, fuzzy_js_1.fuzzy)(query, items, (item) => item.id, { title: 1 }, {
                prefix: "prefix-"
            })).toStrictEqual([{ id: "2", title: "worlprefix-d" }]);
        });
    });
    (0, vitest_1.describe)("opt.suffix", () => {
        (0, vitest_1.test)("should suffix matched field with provided value when given", () => {
            const items = [
                {
                    id: "1",
                    title: "hello"
                },
                {
                    id: "2",
                    title: "world"
                }
            ];
            const query = "llo";
            (0, vitest_1.expect)((0, fuzzy_js_1.fuzzy)(query, items, (item) => item.id, { title: 1 }, {
                suffix: "-suffix"
            })).toStrictEqual([{ id: "1", title: "hello-suffix" }]);
        });
    });
    (0, vitest_1.describe)("separator normalization", () => {
        const items = [
            { id: "1", title: "file search.jpg" },
            { id: "2", title: "file-search.jpg" },
            { id: "3", title: "file_search.jpg" },
            { id: "4", title: "file____search-393.jpg" },
            { id: "5", title: "note-393.jpg" }
        ];
        (0, vitest_1.test)("query with space matches all separator variants", () => {
            const result = (0, fuzzy_js_1.fuzzy)("fl srch", items, (i) => i.id, { title: 1 });
            (0, vitest_1.expect)(result).toStrictEqual(items.slice(0, 4));
        });
        (0, vitest_1.test)("variants with only separators should match", () => {
            const result = (0, fuzzy_js_1.fuzzy)("---", [
                { id: "1", title: "--------.jpg" },
                { id: "2", title: "abc.jpg" }
            ], (i) => i.id, { title: 1 });
            (0, vitest_1.expect)(result).toStrictEqual([{ id: "1", title: "--------.jpg" }]);
        });
        (0, vitest_1.test)("query with special character between words matches all separator variants", () => {
            let result = (0, fuzzy_js_1.fuzzy)("file_search", items, (i) => i.id, { title: 1 });
            (0, vitest_1.expect)(result).toStrictEqual([items[2], items[3], items[0], items[1]]);
            result = (0, fuzzy_js_1.fuzzy)("file-search", items, (i) => i.id, { title: 1 });
            (0, vitest_1.expect)(result).toStrictEqual([items[1], items[0], items[2], items[3]]);
        });
    });
});
