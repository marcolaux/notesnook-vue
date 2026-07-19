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
exports.HTMLParser = exports.sanitizeHtml = exports.parseHTML = void 0;
exports.getDummyDocument = getDummyDocument;
exports.getInnerText = getInnerText;
exports.normalizeToHtmlBody = normalizeToHtmlBody;
exports.extractHeadline = extractHeadline;
exports.extractTitle = extractTitle;
exports.extractMatchingBlocks = extractMatchingBlocks;
const entities_1 = require("entities");
const htmlparser2_1 = require("htmlparser2");
const dom_purify_js_1 = require("./dom-purify.js");
const parseHTML = (input) => "DOMParser" in globalThis
    ? new globalThis.DOMParser().parseFromString(wrapIntoHTMLDocument(input), "text/html")
    : null;
exports.parseHTML = parseHTML;
const sanitizeHtml = (html) => {
    if (!isHtmlValid(html)) {
        return wrapInCodeBlock(html);
    }
    const inputHtml = normalizeToHtmlBody(html);
    return (0, dom_purify_js_1.getDomPurify)().sanitize(inputHtml, {
        RETURN_DOM: false,
        ADD_TAGS: ["iframe"]
    });
};
exports.sanitizeHtml = sanitizeHtml;
function getDummyDocument() {
    const doc = (0, exports.parseHTML)("<div></div>");
    return doc;
}
function getInnerText(element) {
    return (0, entities_1.decodeHTML5)(element.textContent || element.innerText);
}
function wrapIntoHTMLDocument(input) {
    if (typeof input !== "string")
        return input;
    if (input.includes("<body>"))
        return input;
    return `<!doctype html><html lang="en"><head><title>Document Fragment</title></head><body>${input}</body></html>`;
}
const SELF_CLOSING_TAGS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
]);
function isHtmlValid(html) {
    const trimmed = html.trim();
    if (!trimmed)
        return true;
    // Strip comments and script/style content before tag counting to avoid
    // false matches on tags appearing inside comments or raw text blocks.
    const stripped = trimmed
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    // Extract all opening and closing tag names
    const openTagMatches = stripped.matchAll(/<([a-z][a-z0-9]*)\b/gi);
    const closeTagMatches = stripped.matchAll(/<\/([a-z][a-z0-9]*)\b/gi);
    const openTags = Array.from(openTagMatches, (m) => m[1].toLowerCase());
    const closeTags = Array.from(closeTagMatches, (m) => m[1].toLowerCase());
    // Document-level tags (body, html, head) are allowed to be unclosed in fragments
    const documentTags = new Set(["body", "html", "head"]);
    // Count content tags (non-document, non-void tags) — void/self-closing elements
    // never have a closing tag so they must not affect the balance check.
    const openContentTags = openTags.filter((tag) => !documentTags.has(tag) && !SELF_CLOSING_TAGS.has(tag));
    const closeContentTags = closeTags.filter((tag) => !documentTags.has(tag) && !SELF_CLOSING_TAGS.has(tag));
    // For content tags: opening and closing must match
    if (openContentTags.length !== closeContentTags.length) {
        return false;
    }
    // Now do strict tag matching for actual mismatches
    const openStack = [];
    let hasError = false;
    const parser = new htmlparser2_1.Parser({
        onopentag: (name) => {
            if (!SELF_CLOSING_TAGS.has(name.toLowerCase())) {
                openStack.push(name.toLowerCase());
            }
        },
        onclosetag: (name) => {
            const nameLower = name.toLowerCase();
            // htmlparser2 fires onclosetag for void/self-closing elements immediately
            // after onopentag. We never push them onto the stack, so skip here too.
            if (SELF_CLOSING_TAGS.has(nameLower))
                return;
            const lastOpen = openStack[openStack.length - 1];
            if (!lastOpen) {
                hasError = true;
                return;
            }
            if (lastOpen === nameLower) {
                openStack.pop();
            }
            else {
                // Any tag mismatch is an error (except for auto-fixed document tags)
                hasError = true;
            }
        }
    }, {
        lowerCaseTags: true
    });
    try {
        parser.end(html);
        // Unclosed content tags = invalid
        if (openStack.length > 0) {
            return false;
        }
        return !hasError;
    }
    catch (_a) {
        return false;
    }
}
function wrapInCodeBlock(html) {
    const escaped = (0, entities_1.escape)(html);
    return `<html><body><pre><code>${escaped}</code></pre></body></html>`;
}
function normalizeToHtmlBody(input) {
    var _a, _b, _c;
    const source = typeof input === "string" ? input.trim() : "";
    if (!source)
        return "<html><body></body></html>";
    // If HTML has broken/incomplete tags, wrap in code block for display
    if (!isHtmlValid(source)) {
        return wrapInCodeBlock(source);
    }
    const hasHtmlTag = /<html\b[^>]*>/i.test(source);
    const hasBodyOpenTag = /<body\b[^>]*>/i.test(source);
    const hasBodyCloseTag = /<\/body>/i.test(source);
    // If a full body block exists, normalize to <html><body...>...</body></html>.
    const bodyBlock = (_a = source.match(/<body\b[^>]*>[\s\S]*?<\/body>/i)) === null || _a === void 0 ? void 0 : _a[0];
    if (bodyBlock) {
        return `<html>${bodyBlock}</html>`;
    }
    // HTML exists but no complete body: strip outer html and wrap remaining content in body.
    if (hasHtmlTag) {
        const inner = source
            .replace(/<!doctype[^>]*>/i, "")
            .replace(/<html\b[^>]*>/i, "")
            .replace(/<\/html>/i, "")
            .trim();
        const headBlock = (_b = inner.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)) === null || _b === void 0 ? void 0 : _b[0];
        // Handle case with <body ...> present but missing </body>.
        if (hasBodyOpenTag && !hasBodyCloseTag) {
            const bodyOpen = ((_c = inner.match(/<body\b[^>]*>/i)) === null || _c === void 0 ? void 0 : _c[0]) || "<body>";
            const bodyContent = inner.replace(/<body\b[^>]*>/i, "");
            return `<html>${bodyOpen}${bodyContent}</body></html>`;
        }
        if (headBlock) {
            const bodyContent = inner.replace(headBlock, "").trim();
            return `<html>${headBlock}<body>${bodyContent}</body></html>`;
        }
        return `<html><body>${inner}</body></html>`;
    }
    // Body exists without html: add html wrapper, and close body if needed.
    if (hasBodyOpenTag) {
        if (!hasBodyCloseTag)
            return `<html>${source}</body></html>`;
        return `<html>${source}</html>`;
    }
    // Plain fragment/text.
    return `<html><body>${source}</body></html>`;
}
function extractHeadline(html, characterLimit) {
    let text = "";
    let start = false;
    const parser = new htmlparser2_1.Parser({
        onopentag: (name) => {
            if (name === "p")
                start = true;
        },
        onclosetag: (name) => {
            if (name === "p") {
                start = false;
                parser.pause();
                parser.end();
            }
        },
        ontext: (data) => {
            if (start) {
                text += data;
                if (text.length > characterLimit) {
                    text = text.slice(0, characterLimit);
                    parser.pause();
                    parser.end();
                }
            }
        }
    }, {
        lowerCaseTags: false,
        decodeEntities: true
    });
    parser.end(html);
    return text;
}
const TITLE_SOURCE_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];
function extractTitle(html, characterLimit) {
    let text = "";
    let rootTag = undefined;
    const parser = new htmlparser2_1.Parser({
        onopentag: (name) => {
            if (!rootTag && TITLE_SOURCE_TAGS.includes(name)) {
                rootTag = name;
            }
        },
        onclosetag: (name) => {
            if (name === rootTag) {
                if (text) {
                    parser.pause();
                    parser.end();
                }
                else {
                    rootTag = undefined;
                }
            }
        },
        ontext: (data) => {
            if (!rootTag)
                return;
            text += data;
            if (text.length > characterLimit) {
                text = text.slice(0, characterLimit);
                parser.pause();
                parser.end();
            }
        }
    }, {
        lowerCaseTags: false,
        decodeEntities: true
    });
    parser.end(html);
    return text;
}
class HTMLParser {
    constructor(options = {}) {
        const { ontag } = options;
        this.parser = new htmlparser2_1.Parser({
            onopentag: (name, attr) => ontag &&
                ontag(name, attr, {
                    start: this.parser.startIndex,
                    end: this.parser.endIndex
                })
        }, {
            recognizeSelfClosing: true,
            xmlMode: false,
            decodeEntities: false,
            lowerCaseAttributeNames: false,
            lowerCaseTags: false,
            recognizeCDATA: false
        });
    }
    parse(html) {
        this.parser.end(html);
        this.parser.reset();
    }
}
exports.HTMLParser = HTMLParser;
const INLINE_TAGS = [
    "a",
    "abbr",
    "acronym",
    "b",
    "bdo",
    "big",
    "br",
    "button",
    "cite",
    "code",
    "dfn",
    "em",
    "i",
    "img",
    "input",
    "kbd",
    "label",
    "map",
    "object",
    "output",
    "q",
    "samp",
    "script",
    "select",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "textarea",
    "time",
    "tt",
    "var"
];
function extractMatchingBlocks(html, matchTagName) {
    const matches = [];
    let text = "";
    let openedTag = undefined;
    let hasMatches = false;
    const parser = new htmlparser2_1.Parser({
        ontext: (data) => (text += data),
        onopentag(name, attributes) {
            if (!INLINE_TAGS.includes(name) && name !== matchTagName) {
                openedTag = name;
                text = "";
                hasMatches = false;
            }
            if (name === matchTagName) {
                hasMatches = true;
                let tagString = `<${name}`;
                if (attributes.id) {
                    tagString += ` id="${attributes.id}"`;
                }
                tagString += ">";
                text += tagString;
            }
        },
        onclosetag(name) {
            if (name === "br")
                text += "\n";
            if (name === openedTag) {
                if (hasMatches)
                    matches.push(text);
                text = "";
                hasMatches = false;
                openedTag = undefined;
            }
            if (name === matchTagName)
                text += `</${name}>`;
        }
    }, {
        lowerCaseTags: false,
        decodeEntities: true
    });
    parser.end(html);
    if (hasMatches && text)
        matches.push(text);
    return matches;
}
