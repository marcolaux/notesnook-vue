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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformQuery = transformQuery;
const dayjs_1 = __importDefault(require("dayjs"));
const SUPPORTED_FIELDS = {
    title: (ast) => {
        const node = ast.find((a) => a.type === "field_phrase" && a.field === "title") ||
            ast.find((a) => a.type === "query");
        return node && serializeQuery(node);
    },
    content: (ast) => {
        const node = ast.find((a) => a.type === "field_phrase" && a.field === "content") ||
            ast.find((a) => a.type === "query");
        return node && serializeQuery(node);
    },
    // array
    tag: (ast) => parseArrayField("tag", ast),
    color: (ast) => parseArrayField("color", ast),
    // date
    edited_before: (ast) => parseDateField("edited_before", ast),
    edited_after: (ast) => parseDateField("edited_after", ast),
    created_before: (ast) => parseDateField("created_before", ast),
    created_after: (ast) => parseDateField("created_after", ast),
    // boolean
    pinned: (ast) => parseBooleanField("pinned", ast),
    locked: (ast) => parseBooleanField("locked", ast),
    readonly: (ast) => parseBooleanField("readonly", ast),
    favorite: (ast) => parseBooleanField("favorite", ast),
    archived: (ast) => parseBooleanField("archived", ast),
    tagged: (ast) => parseBooleanField("tagged", ast),
    colored: (ast) => parseBooleanField("colored", ast),
    in_notebook: (ast) => parseBooleanField("in_notebook", ast)
};
function isFieldSupported(field) {
    return field in SUPPORTED_FIELDS;
}
function parseBooleanField(field, ast) {
    const node = ast.find((a) => a.type === "field_phrase" && a.field === field);
    const sql = node ? generateSQL(node.value) : "";
    return sql === "false" ? false : sql === "true" ? true : null;
}
function parseArrayField(field, ast) {
    const values = ast
        .filter((a) => a.type === "field_phrase" && a.field === field)
        .map((a) => generateSQL(a.value));
    return values.length > 0 ? values : null;
}
function parseDateField(field, ast) {
    const node = ast.find((a) => a.type === "field_phrase" && a.field === field);
    const date = node ? (0, dayjs_1.default)(generateSQL(node.value)) : null;
    return (date === null || date === void 0 ? void 0 : date.isValid()) ? date.toDate().getTime() : null;
}
const INVALID_QUERY_REGEX = /[!"#$%&'()*+,\-./:;<>=?@[\\\]^_`{|}~§]/;
function escapeSQLString(str) {
    if (str.startsWith('"') && str.endsWith('"')) {
        const innerStr = str.slice(1, -1).replace(/"/g, '""');
        return `"${innerStr}"`;
    }
    const hasInvalidSymbol = INVALID_QUERY_REGEX.test(str);
    const isWildcard = str.startsWith("*") ||
        str.endsWith("*") ||
        str.startsWith("%") ||
        str.endsWith("%");
    if (hasInvalidSymbol || isWildcard) {
        return `"${str}"`;
    }
    // if (isWildcard) {
    //   return str.replace(/(.+?)(\*?$)/gm, (_, text, end) => {
    //     return `${escapeSQLString(text)}${end}`;
    //   });
    // }
    // if (str.includes("-")) {
    //   return `"${str.replace(/"/g, '""')}"`;
    // }
    return str.replace(/"/g, '""');
}
function tokenizeWithFields(query) {
    const tokens = [];
    let buffer = "";
    let isQuoted = false;
    let currentField = undefined;
    for (let i = 0; i < query.length; ++i) {
        const char = query[i];
        if (char === '"') {
            isQuoted = !isQuoted;
        }
        if (char === " " && !isQuoted) {
            if (buffer.length > 0) {
                tokens.push({ field: currentField, token: buffer });
                buffer = "";
            }
        }
        else if (char === ":" && !isQuoted) {
            // Check for field
            const maybeField = buffer.trim().toLowerCase();
            if (isFieldSupported(maybeField)) {
                currentField = maybeField;
                buffer = "";
            }
            else {
                buffer += char;
            }
        }
        else {
            buffer += char;
        }
    }
    if (buffer.length > 0)
        tokens.push({ field: currentField, token: buffer });
    return tokens;
}
// Helper: group tokens by field
function groupTokensByField(tokens) {
    const groups = [];
    let currentField = undefined;
    let currentTokens = [];
    for (const { field, token } of tokens) {
        if (field !== currentField) {
            if (currentTokens.length > 0) {
                groups.push({ field: currentField, tokens: currentTokens });
                currentTokens = [];
            }
            currentField = field;
        }
        currentTokens.push(token);
    }
    if (currentTokens.length > 0) {
        groups.push({ field: currentField, tokens: currentTokens });
    }
    return groups;
}
// Parse a group of tokens into a QueryNode (handles boolean ops, etc)
function parseTokensToQueryNode(tokens) {
    const ast = { type: "query", children: [] };
    let currentPhrase = [];
    for (const token of tokens) {
        if (token === "AND" || token === "OR" || token === "NOT") {
            if (currentPhrase.length > 0) {
                ast.children.push({ type: "phrase", value: currentPhrase });
                currentPhrase = [];
            }
            ast.children.push({ type: token });
        }
        else {
            currentPhrase.push(token);
        }
    }
    if (currentPhrase.length > 0) {
        ast.children.push({ type: "phrase", value: currentPhrase });
    }
    return ast;
}
function transformQueryNode(ast) {
    const transformedAST = Object.assign(Object.assign({}, ast), { children: [] });
    let lastWasPhrase = false;
    for (let i = 0; i < ast.children.length; i++) {
        const child = ast.children[i];
        if (child.type === "phrase") {
            if (lastWasPhrase) {
                transformedAST.children.push({ type: "AND" });
            }
            const transformedPhrase = child.value.map(escapeSQLString);
            transformedAST.children.push({
                type: "phrase",
                value: transformedPhrase
            });
            lastWasPhrase = true;
        }
        else if (child.type === "AND" ||
            child.type === "OR" ||
            child.type === "NOT") {
            if (lastWasPhrase &&
                i + 1 < ast.children.length &&
                ast.children[i + 1].type === "phrase") {
                transformedAST.children.push(child);
                lastWasPhrase = false;
            }
        }
    }
    return transformedAST;
}
function generateSQL(ast) {
    return ast.children
        .map((child) => {
        if (child.type === "phrase") {
            return child.value.filter((v) => v.length >= 3).join(" AND ");
        }
        if (child.type === "AND" || child.type === "OR" || child.type === "NOT") {
            return child.type;
        }
        return "";
    })
        .join(" ");
}
// Main transformer: returns (QueryNode | FieldPhraseNode)[]
function transformQuery(query) {
    const tokens = tokenizeWithFields(query);
    const groups = groupTokensByField(tokens);
    const ast = groups.map((group) => {
        const node = parseTokensToQueryNode(group.tokens);
        const transformedNode = transformQueryNode(node);
        if (group.field) {
            return {
                type: "field_phrase",
                field: group.field,
                value: transformedNode
            };
        }
        else {
            return transformedNode;
        }
    });
    let filters = 0;
    const fields = Object.fromEntries(Object.entries(SUPPORTED_FIELDS).map(([key, field]) => {
        const value = field(ast);
        if (value !== null &&
            value !== undefined &&
            !["content", "title"].includes(key))
            filters++;
        return [key, value];
    }));
    return Object.assign(Object.assign({}, fields), { filters });
}
function serializeQuery(node) {
    return {
        query: generateSQL(node.type === "query" ? node : node.value),
        tokens: tokenizeAst(node.type === "query" ? node : node.value)
    };
}
function tokenizeAst(ast) {
    const result = {
        andTokens: [],
        orTokens: [],
        notTokens: []
    };
    let isNextNot = false;
    let isNextOr = false;
    for (let i = 0; i < ast.children.length; i++) {
        const node = ast.children[i];
        if (node.type === "NOT") {
            isNextNot = true;
            continue;
        }
        if (node.type === "OR") {
            isNextOr = true;
            continue;
        }
        if (node.type === "phrase") {
            // Handle each word in the phrase
            for (const word of node.value) {
                if (result.orTokens.includes(word) ||
                    result.andTokens.includes(word) ||
                    result.notTokens.includes(word)) {
                    isNextOr = false;
                    isNextNot = false;
                    continue;
                }
                if (isNextOr) {
                    result.orTokens.push(word);
                }
                else if (isNextNot) {
                    result.notTokens.push(word);
                }
                else {
                    result.andTokens.push(word);
                }
            }
            isNextOr = false;
            isNextNot = false;
        }
    }
    return result;
}
