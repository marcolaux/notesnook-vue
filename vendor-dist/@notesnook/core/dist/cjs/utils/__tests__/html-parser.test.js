"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const html_parser_js_1 = require("../html-parser.js");
const vitest_1 = require("vitest");
const HTML_INPUT_TYPES = [
    {
        title: "empty input",
        input: "",
        expected: "<html><body></body></html>"
    },
    {
        title: "whitespace input",
        input: "   \n\t  ",
        expected: "<html><body></body></html>"
    },
    {
        title: "plain text",
        input: "Hello world",
        expected: "<html><body>Hello world</body></html>"
    },
    {
        title: "html fragment",
        input: "<p>Hello</p>",
        expected: "<html><body><p>Hello</p></body></html>"
    },
    {
        title: "complete html with body",
        input: "<html><body><p>Hello</p></body></html>",
        expected: "<html><body><p>Hello</p></body></html>"
    },
    {
        title: "complete html with body attributes",
        input: '<html><body class="editor" data-id="1">Hello</body></html>',
        expected: '<html><body class="editor" data-id="1">Hello</body></html>'
    },
    {
        title: "html without body",
        input: "<html><head><title>T</title></head><p>Hello</p></html>",
        expected: "<html><head><title>T</title></head><body><p>Hello</p></body></html>"
    },
    {
        title: "doctype html without body",
        input: "<!doctype html><html><head></head><div>Hello</div></html>",
        expected: "<html><head></head><body><div>Hello</div></body></html>"
    },
    {
        title: "body without html",
        input: "<body><p>Hello</p></body>",
        expected: "<html><body><p>Hello</p></body></html>"
    },
    {
        title: "body with attributes without html",
        input: '<body class="editor"><p>Hello</p></body>',
        expected: '<html><body class="editor"><p>Hello</p></body></html>'
    },
    {
        title: "body without closing tag",
        input: "<body><p>Hello</p>",
        expected: "<html><body><p>Hello</p></body></html>"
    },
    {
        title: "html with unclosed body",
        input: '<html><body class="editor"><p>Hello</p></html>',
        expected: '<html><body class="editor"><p>Hello</p></body></html>'
    },
    {
        title: "uppercase tags",
        input: "<HTML><BODY><p>Hello</p></BODY></HTML>",
        expected: "<html><BODY><p>Hello</p></BODY></html>"
    },
    {
        title: "orphaned closing tag",
        input: "Hello</p>World",
        expected: "<html><body><pre><code>Hello&lt;/p&gt;World</code></pre></body></html>"
    },
    {
        title: "unclosed tag at end",
        input: "<div><p>Hello",
        expected: "<html><body><pre><code>&lt;div&gt;&lt;p&gt;Hello</code></pre></body></html>"
    },
    {
        title: "mismatched closing tags",
        input: "<div><p>Hello</div></p>",
        expected: "<html><body><div><p>Hello</div></p></body></html>"
    },
    {
        title: "unclosed body tag in fragment",
        input: "<body><p>Hello</p>",
        expected: "<html><body><p>Hello</p></body></html>"
    }
];
(0, vitest_1.describe)("normalizeToHtmlBody", () => {
    HTML_INPUT_TYPES.forEach(({ title, input, expected }) => {
        (0, vitest_1.it)(`should normalize ${title}`, () => {
            (0, vitest_1.expect)((0, html_parser_js_1.normalizeToHtmlBody)(input)).toBe(expected);
        });
    });
    (0, vitest_1.it)("should always return html and body sequence at root", () => {
        for (const { input } of HTML_INPUT_TYPES) {
            const normalized = (0, html_parser_js_1.normalizeToHtmlBody)(input).toLowerCase();
            (0, vitest_1.expect)(normalized.startsWith("<html>")).toBe(true);
            (0, vitest_1.expect)(normalized.includes("<body")).toBe(true);
            (0, vitest_1.expect)(normalized.endsWith("</body></html>")).toBe(true);
        }
    });
    (0, vitest_1.it)("should handle runtime non-string values safely", () => {
        (0, vitest_1.expect)((0, html_parser_js_1.normalizeToHtmlBody)(null)).toBe("<html><body></body></html>");
        (0, vitest_1.expect)((0, html_parser_js_1.normalizeToHtmlBody)(undefined)).toBe("<html><body></body></html>");
    });
});
// sanitizeHtml uses globalThis.DOMParser (set to linkedom's DOMParser in
// test.setup.ts) to back DOMPurify when a native browser DOM is unavailable.
(0, vitest_1.describe)("sanitizeHtml", () => {
    (0, vitest_1.it)("strips <script> tags and their content", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)("<p>Hello</p><script>alert(1)</script>");
        (0, vitest_1.expect)(result).not.toContain("<script");
        (0, vitest_1.expect)(result).not.toContain("alert(1)");
        (0, vitest_1.expect)(result).toContain("Hello");
    });
    (0, vitest_1.it)("strips inline event handlers", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<img src="x" onerror="alert(1)">');
        (0, vitest_1.expect)(result).not.toContain("onerror");
        (0, vitest_1.expect)(result).not.toContain("alert(1)");
    });
    (0, vitest_1.it)("strips javascript: URIs from href", () => {
        // eslint-disable-next-line no-script-url
        const result = (0, html_parser_js_1.sanitizeHtml)('<a href="javascript:alert(1)">click</a>');
        (0, vitest_1.expect)(result).not.toContain("javascript:");
        (0, vitest_1.expect)(result).toContain("click");
    });
    (0, vitest_1.it)("strips javascript: URIs from src", () => {
        // eslint-disable-next-line no-script-url
        const result = (0, html_parser_js_1.sanitizeHtml)('<iframe src="javascript:alert(document.domain)"></iframe>');
        (0, vitest_1.expect)(result).not.toContain("javascript:");
    });
    (0, vitest_1.it)("strips onclick and other on* attributes", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<button onclick="evil()">OK</button><div onmouseover="evil()">x</div>');
        (0, vitest_1.expect)(result).not.toContain("onclick");
        (0, vitest_1.expect)(result).not.toContain("onmouseover");
        (0, vitest_1.expect)(result).not.toContain("evil()");
    });
    (0, vitest_1.it)("strips <object> and <embed> tags", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<object data="malicious.swf"></object><embed src="evil.swf">');
        (0, vitest_1.expect)(result).not.toContain("<object");
        (0, vitest_1.expect)(result).not.toContain("<embed");
    });
    (0, vitest_1.it)("strips data: URIs in dangerous attributes", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<a href="data:text/html,<script>alert(1)</script>">x</a>');
        (0, vitest_1.expect)(result).not.toMatch(/href=["']data:/i);
    });
    (0, vitest_1.it)("preserves safe block elements", () => {
        const input = "<p>Hello <strong>world</strong></p><ul><li>item</li></ul>";
        const result = (0, html_parser_js_1.sanitizeHtml)(input);
        (0, vitest_1.expect)(result).toContain("<p>");
        (0, vitest_1.expect)(result).toContain("<strong>world</strong>");
        (0, vitest_1.expect)(result).toContain("<ul>");
        (0, vitest_1.expect)(result).toContain("<li>item</li>");
    });
    (0, vitest_1.it)("preserves safe links with http/https href", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<a href="https://notesnook.com">Notes</a>');
        (0, vitest_1.expect)(result).toContain('href="https://notesnook.com"');
        (0, vitest_1.expect)(result).toContain("Notes");
    });
    (0, vitest_1.it)("preserves headings", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)("<h1>Title</h1><h2>Subtitle</h2>");
        (0, vitest_1.expect)(result).toContain("<h1>Title</h1>");
        (0, vitest_1.expect)(result).toContain("<h2>Subtitle</h2>");
    });
    (0, vitest_1.it)("returns a string (not TrustedHTML or DOM node)", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)("<p>test</p>");
        (0, vitest_1.expect)(typeof result).toBe("string");
    });
    (0, vitest_1.it)("handles empty input without throwing", () => {
        (0, vitest_1.expect)(() => (0, html_parser_js_1.sanitizeHtml)("")).not.toThrow();
        const result = (0, html_parser_js_1.sanitizeHtml)("");
        (0, vitest_1.expect)(typeof result).toBe("string");
    });
    (0, vitest_1.it)("handles plain text without throwing", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)("just plain text");
        (0, vitest_1.expect)(result).toContain("just plain text");
        (0, vitest_1.expect)(typeof result).toBe("string");
    });
    (0, vitest_1.it)("handles deeply nested XSS attempts", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)("<div><p><span onmouseover=\"alert('xss')\">hover</span></p></div>");
        (0, vitest_1.expect)(result).not.toContain("onmouseover");
        (0, vitest_1.expect)(result).toContain("hover");
    });
    (0, vitest_1.it)("strips <base> tag that could hijack relative URLs", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<base href="https://evil.com"><a href="/path">link</a>');
        (0, vitest_1.expect)(result).not.toContain("<base");
    });
    (0, vitest_1.it)("preserves <iframe> with safe https src", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<iframe src="https://example.com"></iframe>');
        (0, vitest_1.expect)(result).toContain("<iframe");
        (0, vitest_1.expect)(result).toContain('src="https://example.com"');
    });
    (0, vitest_1.it)("strips src from <iframe> with javascript: URI", () => {
        // eslint-disable-next-line no-script-url
        const result = (0, html_parser_js_1.sanitizeHtml)('<iframe src="javascript:alert(document.domain)"></iframe>');
        (0, vitest_1.expect)(result).toContain("<iframe");
        (0, vitest_1.expect)(result).not.toContain("javascript:");
    });
    (0, vitest_1.it)("strips src from <iframe> with data: URI", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<iframe src="data:text/html,<script>alert(1)</script>"></iframe>');
        (0, vitest_1.expect)(result).toContain("<iframe");
        (0, vitest_1.expect)(result).not.toContain("data:");
    });
    (0, vitest_1.it)("strips srcdoc from <iframe>", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
        (0, vitest_1.expect)(result).toContain("<iframe");
        (0, vitest_1.expect)(result).not.toContain("srcdoc");
    });
    (0, vitest_1.it)("strips event handlers from <iframe>", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<iframe src="https://example.com" onload="steal()"></iframe>');
        (0, vitest_1.expect)(result).toContain("<iframe");
        (0, vitest_1.expect)(result).not.toContain("onload");
        (0, vitest_1.expect)(result).not.toContain("steal()");
    });
    (0, vitest_1.it)("preserves nested <iframe> with safe src alongside other elements", () => {
        const result = (0, html_parser_js_1.sanitizeHtml)('<div><p>Safe content</p><iframe src="https://example.com"></iframe></div>');
        (0, vitest_1.expect)(result).toContain("Safe content");
        (0, vitest_1.expect)(result).toContain("<iframe");
        (0, vitest_1.expect)(result).toContain('src="https://example.com"');
    });
});
