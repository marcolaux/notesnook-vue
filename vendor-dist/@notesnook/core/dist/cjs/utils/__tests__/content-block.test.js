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
const content_block_js_1 = require("../content-block.js");
(0, vitest_1.describe)("ContentBlock Utils", () => {
    (0, vitest_1.describe)("extractInternalLinks", () => {
        (0, vitest_1.it)("should extract internal links from a block", () => {
            const block = {
                type: "someType",
                id: "someId",
                content: "This is a test [[nn://note/123|link]]"
            };
            const links = (0, content_block_js_1.extractInternalLinks)(block);
            (0, vitest_1.expect)(links).toHaveLength(1);
            (0, vitest_1.expect)(links[0].id).toBe("123");
            (0, vitest_1.expect)(links[0].text).toBe("link");
        });
        (0, vitest_1.it)("should return an empty array if no internal links are present", () => {
            const block = {
                type: "someType",
                id: "someId",
                content: "This is a test with no links"
            };
            const links = (0, content_block_js_1.extractInternalLinks)(block);
            (0, vitest_1.expect)(links).toHaveLength(0);
        });
        (0, vitest_1.it)("should skip links with no noteId", () => {
            const block = {
                type: "someType",
                id: "someId",
                content: "This is a test [[nn://note/|link]] with undefined URL"
            };
            const links = (0, content_block_js_1.extractInternalLinks)(block);
            (0, vitest_1.expect)(links).toHaveLength(0);
        });
        (0, vitest_1.it)("should extract internal links with '|' in id", () => {
            const block = {
                type: "someType",
                id: "someId",
                content: "This is a test [[nn://note/myid|ofmyid|actualtext]]"
            };
            const links = (0, content_block_js_1.extractInternalLinks)(block);
            (0, vitest_1.expect)(links).toHaveLength(1);
            (0, vitest_1.expect)(links[0].id).toBe("myid|ofmyid");
            (0, vitest_1.expect)(links[0].text).toBe("actualtext");
        });
    });
    (0, vitest_1.describe)("highlightInternalLinks", () => {
        (0, vitest_1.it)("should highlight internal links in a block", () => {
            const block = {
                type: "someType",
                id: "someId",
                content: "This is a test [[nn://note/123|link]]"
            };
            const noteId = "123";
            const highlighted = (0, content_block_js_1.highlightInternalLinks)(block, noteId);
            (0, vitest_1.expect)(highlighted).toHaveLength(1);
            (0, vitest_1.expect)(highlighted[0][1].highlighted).toBe(true);
            (0, vitest_1.expect)(highlighted[0][1].text).toBe("link");
        });
        (0, vitest_1.it)("should not highlight links with a different noteId", () => {
            const block = {
                type: "someType",
                id: "someId",
                content: "This is a test [[nn://note/123|link]]"
            };
            const noteId = "456";
            const highlighted = (0, content_block_js_1.highlightInternalLinks)(block, noteId);
            (0, vitest_1.expect)(highlighted).toHaveLength(0);
        });
    });
    (0, vitest_1.describe)("ellipsize", () => {
        (0, vitest_1.it)("should ellipsize text from the start", () => {
            const text = "This is a long text that needs to be truncated";
            const result = (0, content_block_js_1.ellipsize)(text, 10, "start");
            (0, vitest_1.expect)(result).toBe("... truncated");
        });
        (0, vitest_1.it)("should ellipsize text from the end", () => {
            const text = "This is a long text that needs to be truncated";
            const result = (0, content_block_js_1.ellipsize)(text, 10, "end");
            (0, vitest_1.expect)(result).toBe("This is a ...");
        });
        (0, vitest_1.it)("should not ellipsize text if it is shorter than maxLength", () => {
            const text = "Short text";
            const result = (0, content_block_js_1.ellipsize)(text, 20, "end");
            (0, vitest_1.expect)(result).toBe("Short text");
        });
    });
});
