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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.buildHTML = buildHTML;
const html_parser_js_1 = require("../../html-parser.js");
const index_js_1 = require("./languages/index.js");
const template_js_1 = require("./template.js");
const replaceableAttributes = {
    'data-float="true" data-align="right"': 'align="right"',
    'data-float="true" data-align="left"': 'align="left"',
    'data-align="left"': 'style="margin-right:auto;margin-left:0;display: block;"',
    'data-align="right"': 'style="margin-left:auto;margin-right:0;display: block;"',
    'data-align="center"': 'style="margin-left:auto;margin-right:auto;display: block;"'
};
const LANGUAGE_REGEX = /(?:^|\s)lang(?:uage)?-([\w-]+)(?=\s|$)/i;
function buildHTML(templateData) {
    return __awaiter(this, void 0, void 0, function* () {
        return (0, template_js_1.template)(yield preprocessHTML(templateData));
    });
}
function preprocessHTML(templateData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const { content } = templateData;
        let html = content.replace(/<p([^>]*)><\/p>/gm, "<p$1><br/></p>");
        for (const attribute in replaceableAttributes) {
            const value = replaceableAttributes[attribute];
            while (html.includes(attribute))
                html = html.replace(attribute, value);
        }
        const doc = (0, html_parser_js_1.parseHTML)(html);
        if (!doc)
            throw new Error("Could not parse HTML to DOM.");
        const images = doc.querySelectorAll("img");
        for (const image of images) {
            const container = doc.createElement("span");
            container.append(image.cloneNode());
            for (const attr of image.attributes) {
                if (attr.name === "src" ||
                    attr.name === "height" ||
                    attr.name === "width")
                    continue;
                container.setAttribute(attr.name, attr.value);
            }
            container.classList.add("image-container");
            image.replaceWith(container);
        }
        const mathBlocks = doc.querySelectorAll(".math-block.math-node");
        const mathInlines = doc.querySelectorAll(".math-inline.math-node");
        if (mathBlocks.length || mathInlines.length) {
            const katex = (yield Promise.resolve().then(() => __importStar(require("katex")))).default;
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            yield Promise.resolve().then(() => __importStar(require("katex/contrib/mhchem/mhchem.js")));
            for (const mathBlock of mathBlocks) {
                const text = mathBlock.textContent || "";
                mathBlock.innerHTML = katex.renderToString(text, {
                    displayMode: true,
                    throwOnError: false
                });
            }
            for (const mathInline of mathInlines) {
                const text = mathInline.textContent || "";
                mathInline.innerHTML = katex.renderToString(text, {
                    throwOnError: false,
                    displayMode: false
                });
            }
        }
        const codeblocks = doc.querySelectorAll("pre > code");
        if (codeblocks.length) {
            const { default: prismjs } = yield Promise.resolve().then(() => __importStar(require("prismjs")));
            // const { loadLanguage } = await import("./languages/index.js");
            prismjs.register = (syntax) => {
                if (typeof syntax === "function")
                    syntax(prismjs);
            };
            for (const codeblock of codeblocks) {
                if (!codeblock.parentElement)
                    continue;
                const language = (_a = LANGUAGE_REGEX.exec(codeblock.parentElement.className)) === null || _a === void 0 ? void 0 : _a[1];
                if (!language)
                    continue;
                const { default: grammar } = (yield (0, index_js_1.loadLanguage)(language)) || {};
                if (!grammar)
                    continue;
                grammar(prismjs);
                if (!prismjs.languages[language])
                    continue;
                codeblock.innerHTML = prismjs.highlight(codeblock.textContent || "", prismjs.languages[language], language);
            }
        }
        templateData.content = doc.body.innerHTML;
        return templateData;
    });
}
