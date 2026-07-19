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
const vitest_1 = require("vitest");
const query_transformer_js_1 = require("../query-transformer.js");
const TRANSFORM_QUERY_TESTS = [
    ["hello world", `hello AND world`],
    ["hello world OR bar", `hello AND world OR bar`],
    ["hello world OR bar NOT baz", `hello AND world OR bar NOT baz`],
    ["hello world OR NOT AND", `hello AND world`],
    ["hello world OR NOT AND something", `hello AND world AND something`],
    ["hello world -foo", `hello AND world AND "-foo"`],
    ["hello world phrase-with-dash", `hello AND world AND "phrase-with-dash"`],
    ["hello world phrase-with-dash*", 'hello AND world AND "phrase-with-dash*"'],
    ["example + foo + bar", `example AND "+" AND foo AND "+" AND bar`],
    ["example OR foo NOT bar", `example OR foo NOT bar`],
    [
        'example "quoted phrase" "another quoted phrase"',
        `example AND "quoted phrase" AND "another quoted phrase"`
    ],
    ['"phrase-with-dash*"', `"phrase-with-dash*"`],
    [
        '-foo + bar OR "quoted-phrase"',
        `"-foo" AND "+" AND bar OR "quoted-phrase"`
    ],
    [
        'phrase-with-dash* + "quoted-phrase"',
        `"phrase-with-dash*" AND "+" AND "quoted-phrase"`
    ],
    [
        'example -foo + bar + "quoted-dash-phrase*" OR "another-quoted-phrase"',
        `example AND "-foo" AND "+" AND bar AND "+" AND "quoted-dash-phrase*" OR "another-quoted-phrase"`
    ],
    ["", undefined],
    ["foo", `foo`],
    ['"quoted"', '"quoted"'],
    ["-foo -bar", `"-foo" AND "-bar"`],
    ["foo + + bar", `foo AND "+" AND "+" AND bar`],
    ["foo + OR", `foo AND "+"`],
    ['"special -phrase*"', '"special -phrase*"'],
    ["foo* + bar*", `"foo*" AND "+" AND "bar*"`],
    ["(foo + bar) -baz", `"(foo" AND "+" AND "bar)" AND "-baz"`],
    ['"phrase with "quotes""', '"phrase with ""quotes"""'],
    ['foo + "bar -baz" OR "qux*"', `foo AND "+" AND "bar -baz" OR "qux*"`],
    ["foo + bar + ", `foo AND "+" AND bar AND "+"`],
    ["+foo bar", `"+foo" AND bar`],
    ["foo*bar*", `"foo*bar*"`],
    ['"escaped "quotes""', '"escaped ""quotes"""'],
    ["-hello-world", `"-hello-world"`],
    ["-hello-world*", '"-hello-world*"'],
    ["*helo*", `"*helo*"`],
    [">he", `">he"`],
    ["something<hello", `"something<hello"`],
    ["<", `"<"`],
    [">", `">"`]
];
for (const [input, expectedOutput] of TRANSFORM_QUERY_TESTS) {
    (0, vitest_1.test)(`should transform "${input}" into a valid SQL query`, () => {
        var _a;
        (0, vitest_1.expect)((_a = (0, query_transformer_js_1.transformQuery)(input).content) === null || _a === void 0 ? void 0 : _a.query).toBe(expectedOutput);
    });
}
