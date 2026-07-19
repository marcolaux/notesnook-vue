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
exports.splitHighlightedMatch = splitHighlightedMatch;
const fuzzyjs_1 = require("fuzzyjs");
const kysely_1 = require("@streetwriters/kysely");
const virtualized_grouping_js_1 = require("../utils/virtualized-grouping.js");
const logger_js_1 = require("../logger.js");
const fts_js_1 = require("../database/fts.js");
const query_transformer_js_1 = require("../utils/query-transformer.js");
const grouping_js_1 = require("../utils/grouping.js");
const fuzzy_js_1 = require("../utils/fuzzy.js");
const html_parser_js_1 = require("../utils/html-parser.js");
const htmlparser2_1 = require("htmlparser2");
const MATCH_TAG_NAME = "nn-search-result";
const MATCH_TAG_REGEX = new RegExp(`<${MATCH_TAG_NAME}\\s+id="(.+?)">(.*?)<\\/${MATCH_TAG_NAME}>`, "gm");
class Lookup {
    constructor(db) {
        this.db = db;
    }
    notes(query, notes) {
        return this.toSearchResults((limit, sortOptions) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const excludedIds = this.db.trash.cache.notes;
            const { content, title } = (0, query_transformer_js_1.transformQuery)(query);
            const ftsResults = (yield ((_a = this.ftsQueryBuilder({ content: content === null || content === void 0 ? void 0 : content.query, title: title === null || title === void 0 ? void 0 : title.query }, excludedIds, notes)) === null || _a === void 0 ? void 0 : _a.select(["results.id"]).groupBy("results.id").orderBy((0, kysely_1.sql) `SUM(results.rank)`, (sortOptions === null || sortOptions === void 0 ? void 0 : sortOptions.sortDirection) || "desc").execute().catch((e) => {
                logger_js_1.logger.error(e, `Error while searching`, { query });
                return [];
            }).then((r) => r.map((r) => r.id)))) || [];
            const regexMatches = yield ((_b = this.regexQueryBuilder({
                content: filterSmallTokens(content === null || content === void 0 ? void 0 : content.tokens),
                title: filterSmallTokens(title === null || title === void 0 ? void 0 : title.tokens)
            }, (!!content || !!title) && ftsResults.length > 0 ? ftsResults : notes)) === null || _b === void 0 ? void 0 : _b.select("results.id").execute());
            if (!regexMatches)
                return ftsResults;
            return regexMatches.map((r) => r.id);
        }), notes || this.db.notes.all);
    }
    notesWithHighlighting(query, notes, sortOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const db = this.db.sql();
            const excludedIds = this.db.trash.cache.notes;
            const { content, title, tag, color, archived, favorite, locked, pinned, readonly, created_before, created_after, edited_after, edited_before, colored, tagged, in_notebook, filters } = (0, query_transformer_js_1.transformQuery)(query);
            if (filters > 0) {
                const tagIds = tagged
                    ? yield this.db.tags.all.ids()
                    : (tag === null || tag === void 0 ? void 0 : tag.length)
                        ? yield this.db.tags.all
                            .where((eb) => eb("tags.title", "in", tag))
                            .ids()
                        : [];
                const colorIds = colored
                    ? yield this.db.colors.all.ids()
                    : (color === null || color === void 0 ? void 0 : color.length)
                        ? yield this.db.colors.all
                            .where((eb) => eb("colors.title", "in", color))
                            .ids()
                        : [];
                const notebookIds = typeof in_notebook === "boolean"
                    ? yield this.db.notebooks.all.ids()
                    : [];
                const defaultVault = yield this.db.vaults.default();
                notes = notes.where((eb) => {
                    const exprs = [];
                    const tagsFilter = this.db.relations
                        .from({ ids: tagIds, type: "tag" }, "note")
                        .selector.filter.select("id");
                    const colorsFilter = this.db.relations
                        .from({ ids: colorIds, type: "color" }, "note")
                        .selector.filter.select("id");
                    if (typeof tagged === "boolean")
                        exprs.push(eb("notes.id", tagged ? "in" : "not in", tagsFilter));
                    else if (tagIds.length > 0)
                        exprs.push(eb("notes.id", "in", tagsFilter));
                    if (typeof colored === "boolean")
                        exprs.push(eb("notes.id", colored ? "in" : "not in", colorsFilter));
                    else if (colorIds.length > 0)
                        exprs.push(eb("notes.id", "in", colorsFilter));
                    if (typeof in_notebook === "boolean")
                        exprs.push(eb("notes.id", in_notebook ? "in" : "not in", this.db.relations
                            .from({ ids: notebookIds, type: "notebook" }, "note")
                            .selector.filter.select("id")));
                    if (typeof locked === "boolean" && defaultVault) {
                        const filter = this.db.relations
                            .from(defaultVault, "note")
                            .selector.filter.select("id");
                        exprs.push(eb("notes.id", locked ? "in" : "not in", filter));
                    }
                    if (typeof archived === "boolean")
                        exprs.push(eb("notes.archived", "==", archived));
                    if (typeof favorite === "boolean")
                        exprs.push(eb("notes.favorite", "==", favorite));
                    if (typeof pinned === "boolean")
                        exprs.push(eb("notes.pinned", "==", pinned));
                    if (typeof readonly === "boolean")
                        exprs.push(eb("notes.readonly", "==", readonly));
                    if (typeof created_after === "number")
                        exprs.push(eb("notes.dateCreated", ">", created_after));
                    if (typeof created_before === "number")
                        exprs.push(eb("notes.dateCreated", "<", created_before));
                    if (typeof edited_after === "number")
                        exprs.push(eb("notes.dateEdited", ">", edited_after));
                    if (typeof edited_before === "number")
                        exprs.push(eb("notes.dateEdited", "<", edited_before));
                    return eb.and(exprs);
                });
            }
            console.time("gather matches");
            const ftsResults = (yield ((_a = this.ftsQueryBuilder({ content: content === null || content === void 0 ? void 0 : content.query, title: title === null || title === void 0 ? void 0 : title.query }, excludedIds, notes)) === null || _a === void 0 ? void 0 : _a.select(["id", "type", "rank"]).execute().catch((e) => {
                logger_js_1.logger.error(e, `Error while searching`, { query });
                return [];
            }))) || [];
            const ftsIds = ftsResults.map((r) => r.id);
            const regexMatches = (yield ((_b = this.regexQueryBuilder({
                content: filterSmallTokens(content === null || content === void 0 ? void 0 : content.tokens),
                title: filterSmallTokens(title === null || title === void 0 ? void 0 : title.tokens)
            }, (!!content || !!title) && ftsIds.length > 0 ? ftsIds : notes)) === null || _b === void 0 ? void 0 : _b.select(["results.id", "results.type", (0, kysely_1.sql) `1`.as("rank")]).execute())) || [];
            console.timeEnd("gather matches");
            console.time("sorting matches");
            let matches = { ids: [], values: [] };
            for (const array of [ftsResults, regexMatches])
                for (const { id, type, rank } of array) {
                    const index = matches.ids.indexOf(id);
                    const match = index === -1
                        ? {
                            id,
                            types: [],
                            rank: 0
                        }
                        : matches.values[index];
                    match.types.push(type);
                    match.rank += rank || 0;
                    if (index === -1) {
                        matches.ids.push(id);
                        matches.values.push(match);
                    }
                }
            if (!sortOptions || sortOptions.sortBy === "relevance") {
                matches.values.sort((sortOptions === null || sortOptions === void 0 ? void 0 : sortOptions.sortDirection) === "desc"
                    ? (a, b) => a.rank - b.rank
                    : (a, b) => b.rank - a.rank);
                matches.ids = matches.values.map((c) => c.id);
            }
            else {
                const sortedNoteIds = yield this.db.notes.exportable
                    .fields(["notes.id"])
                    .items(matches.ids, sortOptions);
                const sorted = { ids: [], values: [] };
                for (const { id } of sortedNoteIds) {
                    const index = matches.ids.indexOf(id);
                    if (index === -1)
                        continue;
                    sorted.values.push(matches.values[index]);
                    sorted.ids.push(id);
                }
                matches = sorted;
            }
            console.timeEnd("sorting matches");
            const isQueryless = !matches.ids.length && filters > 0;
            if (isQueryless) {
                const ids = yield notes.items(undefined, sortOptions);
                for (const { id } of ids) {
                    matches.values.push({
                        id,
                        rank: 1,
                        types: ["title"]
                    });
                    matches.ids.push(id);
                }
            }
            const titleTokens = transformTokens(title === null || title === void 0 ? void 0 : title.tokens);
            const contentTokens = transformTokens(content === null || content === void 0 ? void 0 : content.tokens);
            return new virtualized_grouping_js_1.VirtualizedGrouping(matches.ids.length, 20, () => __awaiter(this, void 0, void 0, function* () { return matches.ids; }), (start, end) => __awaiter(this, void 0, void 0, function* () {
                const chunk = matches.values.slice(start, end);
                const titleMatches = chunk
                    .filter((c) => c.types.includes("title"))
                    .map((c) => c.id);
                const contentMatches = chunk
                    .filter((c) => c.types.includes("content"))
                    .map((c) => c.id);
                const results = chunk.map((c) => ({
                    id: c.id,
                    title: [],
                    type: "searchResult",
                    content: [],
                    rank: 0,
                    dateCreated: 0,
                    dateModified: 0
                }));
                const titles = titleMatches.length > 0 && !isQueryless
                    ? yield db
                        .selectFrom("notes")
                        .where("id", "in", titleMatches)
                        .select(["id", "title"])
                        .execute()
                    : [];
                for (const title of titles) {
                    const { text: highlighted } = highlightQueries(title.title || "", titleTokens.allTokens);
                    const result = results.find((c) => c.id === title.id);
                    if (!result)
                        continue;
                    result.title = splitHighlightedMatch(highlighted).flatMap((m) => m);
                }
                const htmls = contentMatches.length > 0 && !isQueryless
                    ? yield db
                        .selectFrom("content")
                        .where("noteId", "in", contentMatches)
                        .select(["data", "noteId as id"])
                        .$castTo()
                        .execute()
                    : [];
                for (const html of htmls) {
                    const result = results.find((r) => r.id === html.id);
                    if (!result)
                        continue;
                    const highlighted = highlightHtmlContent(html.data, contentTokens.allTokens);
                    result.content = (0, html_parser_js_1.extractMatchingBlocks)(highlighted, MATCH_TAG_NAME).flatMap((block) => {
                        return splitHighlightedMatch(block);
                    });
                    if (result.content.length === 0)
                        continue;
                    result.rawContent = highlighted;
                }
                const resultsWithMissingTitle = results
                    .filter(isQueryless
                    ? (r) => !r.title.length
                    : (r) => !r.title.length && r.content.length > 0)
                    .map((r) => r.id);
                if (resultsWithMissingTitle.length > 0) {
                    const titles = yield db
                        .selectFrom("notes")
                        .where("id", "in", resultsWithMissingTitle)
                        .select(["id", "title"])
                        .execute();
                    for (const title of titles) {
                        const result = results.find((r) => r.id === title.id);
                        if (!result || !title.title)
                            continue;
                        result.title = stringToMatch(title.title);
                    }
                }
                for (const result of results) {
                    result.content.sort((a, b) => getMatchScore(b, contentTokens.allTokens) -
                        getMatchScore(a, contentTokens.allTokens));
                }
                return {
                    ids: results.map((c) => c.id),
                    items: results
                };
            }), () => new Map([
                [
                    0,
                    {
                        index: 0,
                        group: {
                            id: "0",
                            title: "",
                            type: "header"
                        }
                    }
                ]
            ]));
        });
    }
    ftsQueryBuilder(queries, excludedIds = [], filter) {
        if (!queries.content && !queries.title)
            return;
        const db = this.db.sql();
        function buildTitleQuery(eb) {
            return eb
                .selectFrom("notes_fts")
                .$if(!!filter, (eb) => eb.where("id", "in", filter.filter.select("id")))
                .$if(excludedIds.length > 0, (eb) => eb.where("id", "not in", excludedIds))
                .where("title", "match", queries.title)
                .where("rank", "=", (0, kysely_1.sql) `'bm25(1.0, 10.0)'`)
                .select(["id", "rank", (0, kysely_1.sql) `'title'`.as("type")]);
        }
        function buildContentQuery(eb) {
            return eb
                .selectFrom("content_fts")
                .$if(!!filter, (eb) => eb.where("noteId", "in", filter.filter.select("id")))
                .$if(excludedIds.length > 0, (eb) => eb.where("noteId", "not in", excludedIds))
                .where("data", "match", queries.content)
                .where("rank", "=", (0, kysely_1.sql) `'bm25(1.0, 1.0, 10.0)'`)
                .select(["noteId as id", "rank", (0, kysely_1.sql) `'content'`.as("type")])
                .$castTo();
        }
        if (queries.content && queries.title)
            return db.selectFrom((eb) => buildTitleQuery(eb)
                .unionAll((eb) => buildContentQuery(eb))
                .as("results"));
        else if (queries.content)
            return db.selectFrom((eb) => buildContentQuery(eb).as("results"));
        else if (queries.title)
            return db.selectFrom((eb) => buildTitleQuery(eb).as("results"));
    }
    regexQueryBuilder(queries, ids) {
        var _a, _b;
        if (!((_a = queries.content) === null || _a === void 0 ? void 0 : _a.length) && !((_b = queries.title) === null || _b === void 0 ? void 0 : _b.length))
            return;
        const buildRegex = (queries) => queries
            .filter((q) => q && q.length > 0)
            .map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|");
        function buildTitleQuery(eb, queries) {
            const regex = buildRegex(queries);
            return eb
                .selectFrom("notes")
                .$if(!!ids, (eb) => eb.where("id", "in", Array.isArray(ids) ? ids : ids.filter.select("id")))
                .where("title", "regexp", (0, kysely_1.sql) `${regex}`)
                .select(["id", (0, kysely_1.sql) `'title'`.as("type")]);
        }
        function buildContentQuery(eb, queries) {
            const regex = buildRegex(queries);
            return eb
                .selectFrom("content")
                .where("content.locked", "!=", true)
                .$if(!!ids, (eb) => eb.where("noteId", "in", Array.isArray(ids) ? ids : ids.filter.select("id")))
                .where("data", "regexp", (0, kysely_1.sql) `${regex}`)
                .select(["noteId as id", (0, kysely_1.sql) `'content'`.as("type")])
                .$castTo();
        }
        if (queries.content && queries.title)
            return this.db.sql().selectFrom((eb) => buildTitleQuery(eb, queries.title)
                .unionAll((eb) => buildContentQuery(eb, queries.content))
                .as("results"));
        else if (queries.content)
            return this.db
                .sql()
                .selectFrom((eb) => buildContentQuery(eb, queries.content).as("results"));
        else if (queries.title)
            return this.db
                .sql()
                .selectFrom((eb) => buildTitleQuery(eb, queries.title).as("results"));
    }
    notebooks(query) {
        const fields = [
            { name: "id", column: "notebooks.id", weight: -100, ignore: true },
            { name: "title", column: "notebooks.title", weight: 10 },
            {
                name: "description",
                column: "notebooks.description"
            }
        ];
        return this.search(this.db.notebooks.all, query, fields);
    }
    tags(query) {
        return this.search(this.db.tags.all, query, [
            { name: "id", column: "tags.id", weight: -100, ignore: true },
            { name: "title", column: "tags.title" }
        ]);
    }
    reminders(query) {
        const fields = [
            { name: "id", column: "reminders.id", weight: -100, ignore: true },
            { name: "title", column: "reminders.title", weight: 10 },
            {
                name: "description",
                column: "reminders.description"
            }
        ];
        return this.search(this.db.reminders.all, query, fields);
    }
    trash(query) {
        return {
            sorted: (sortOptions) => __awaiter(this, void 0, void 0, function* () {
                const { ids, items } = yield this.filterTrash(query, undefined, sortOptions);
                return new virtualized_grouping_js_1.VirtualizedGrouping(ids.length, this.db.options.batchSize, () => Promise.resolve(ids), (start, end) => __awaiter(this, void 0, void 0, function* () {
                    return {
                        ids: ids.slice(start, end),
                        items: items.slice(start, end)
                    };
                }));
            }),
            items: (limit, sortOptions) => __awaiter(this, void 0, void 0, function* () {
                const { items } = yield this.filterTrash(query, limit, sortOptions);
                return items;
            }),
            ids: () => this.filterTrash(query).then(({ ids }) => ids)
        };
    }
    attachments(query) {
        return this.search(this.db.attachments.all, query, [
            { name: "id", column: "attachments.id", weight: -100 },
            { name: "filename", column: "attachments.filename", weight: 5 },
            { name: "mimeType", column: "attachments.mimeType" },
            { name: "hash", column: "attachments.hash" }
        ]);
    }
    search(selector, query, fields) {
        return this.toSearchResults((limit, sortOptions) => __awaiter(this, void 0, void 0, function* () {
            const results = yield this.filter(selector, query, fields, {
                sortOptions,
                limit
            });
            return results.map((item) => item.id);
        }), selector);
    }
    filter(selector_1, query_1, fields_1) {
        return __awaiter(this, arguments, void 0, function* (selector, query, fields, options = {}) {
            const columns = fields.map((f) => f.column);
            const items = yield selector.fields(columns).items();
            selector.fields([]);
            return (0, fuzzy_js_1.fuzzy)(query, items, (item) => item.id, Object.fromEntries(fields.filter((f) => !f.ignore).map((f) => [f.name, f.weight || 1])), options);
        });
    }
    toSearchResults(ids, selector) {
        return {
            sorted: (sortOptions) => __awaiter(this, void 0, void 0, function* () {
                return this.toVirtualizedGrouping(yield ids(undefined, sortOptions), selector, sortOptions);
            }),
            items: (limit, sortOptions) => __awaiter(this, void 0, void 0, function* () { return this.toItems(yield ids(limit, sortOptions), selector, sortOptions); }),
            ids
        };
    }
    filterTrash(query, limit, sortOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const items = yield this.db.trash.all();
            const results = new Map();
            for (const item of items) {
                if (limit !== undefined && results.size === limit)
                    break;
                const result = (0, fuzzyjs_1.match)(query, item.title);
                if (result.match) {
                    results.set(item.id, { rank: result.score, item });
                }
            }
            const sorted = Array.from(results.entries());
            if (!sortOptions || sortOptions.sortBy === "relevance")
                sorted.sort((sortOptions === null || sortOptions === void 0 ? void 0 : sortOptions.sortDirection) === "desc"
                    ? (a, b) => a[1].rank - b[1].rank
                    : (a, b) => b[1].rank - a[1].rank);
            else {
                const selector = (0, grouping_js_1.getSortSelectors)(sortOptions)[sortOptions.sortDirection];
                sorted.sort((a, b) => selector(a[1].item, b[1].item));
            }
            return {
                ids: sorted.map((a) => a[0]),
                items: sorted.map((a) => a[1].item)
            };
        });
    }
    toVirtualizedGrouping(ids, selector, sortOptions) {
        if ((sortOptions === null || sortOptions === void 0 ? void 0 : sortOptions.sortBy) === "relevance")
            sortOptions = undefined;
        return new virtualized_grouping_js_1.VirtualizedGrouping(ids.length, this.db.options.batchSize, () => Promise.resolve(ids), (start, end) => __awaiter(this, void 0, void 0, function* () {
            const items = yield selector.items(ids.slice(start, end), sortOptions);
            return {
                ids: items.map((i) => i.id),
                items
            };
        }), (items) => (0, grouping_js_1.groupArray)(items, () => `${items.length} results`));
    }
    toItems(ids, selector, sortOptions) {
        if (!ids.length)
            return [];
        if ((sortOptions === null || sortOptions === void 0 ? void 0 : sortOptions.sortBy) === "relevance")
            sortOptions = undefined;
        return selector.items(ids, sortOptions);
    }
    rebuild() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = this.db.sql();
            yield (0, fts_js_1.rebuildSearchIndex)(db);
        });
    }
}
exports.default = Lookup;
function highlightQueries(text, queries) {
    if (!text || !queries.length)
        return { text, hasMatches: false };
    const patterns = queries
        .filter((q) => q.length > 0)
        .map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (patterns.length === 0)
        return { text, hasMatches: false };
    try {
        const regex = new RegExp(patterns.join("|"), "gi");
        const normalizedText = removeDiacritics(text);
        const { result, hasMatches } = highlightRegexMatches(text, normalizedText, regex, 0);
        return { text: result, hasMatches };
    }
    catch (error) {
        return { text, hasMatches: false };
    }
}
function splitHighlightedMatch(text) {
    const parts = text.split(MATCH_TAG_REGEX);
    const allMatches = [];
    let matches = [];
    let totalLength = 0;
    for (let i = 0; i < parts.length - 1; i += 3) {
        const prefix = parts[i];
        const matchId = parts[i + 1];
        const match = parts[i + 2];
        let suffix = parts[i + 3];
        const matchLength = prefix.length + match.length + ((suffix === null || suffix === void 0 ? void 0 : suffix.length) || 0);
        if (totalLength > 120 && matches.length > 0) {
            matches[matches.length - 1].suffix += "...";
            allMatches.push(matches);
            matches = [];
            totalLength = 0;
        }
        if (suffix) {
            suffix = suffix.replace(/\s{2,}/gm, " ");
            const [_suffix, remaining] = splitToNearestWord(suffix, Math.max(suffix.length / 2, 60));
            parts[i + 3] = remaining;
            suffix = _suffix;
        }
        matches.push({
            match: match,
            prefix: prefix.replace(/\s{2,}/gm, " ").trimStart(),
            suffix: suffix || "",
            id: matchId || undefined
        });
        totalLength += matchLength;
    }
    if (matches.length > 0) {
        matches[matches.length - 1].suffix += parts[parts.length - 1];
        allMatches.push(matches);
    }
    for (const matches of allMatches) {
        const totalLength = matches.reduce((length, curr) => length + curr.match.length + curr.prefix.length + curr.suffix.length, 0);
        if (totalLength > 200) {
            const start = matches[0];
            const end = matches[matches.length - 1];
            const centered = centerMatch(start.prefix, end.suffix, totalLength - (start.prefix.length + end.suffix.length), {
                maxLength: 200
            });
            start.prefix = centered.prefix || " ";
            end.suffix = centered.suffix || " ";
        }
    }
    return allMatches;
}
function splitToNearestWord(text, maxLength) {
    if (text.length <= maxLength)
        return [text, ""];
    // Find the last space before maxLength
    let splitIndex = text.lastIndexOf(" ", maxLength);
    // If no space found, force split at maxLength
    if (splitIndex === -1) {
        splitIndex = maxLength;
    }
    const firstPart = text.substring(0, splitIndex);
    const remainingText = text.substring(splitIndex);
    return [firstPart, remainingText];
}
function centerMatch(prefix, suffix, matchLength, options = {}) {
    const { maxLength = 120, minContext = 20, ellipsis = "...", preferLeft = true } = options;
    // Handle edge cases
    if (!prefix && !suffix)
        return {};
    if (matchLength >= maxLength)
        return {};
    // Calculate available space for context
    const availableSpace = maxLength - matchLength;
    // Calculate initial context lengths
    let leftLength = Math.floor(availableSpace / 2);
    let rightLength = availableSpace - leftLength;
    // Adjust if we prefer left context
    if (preferLeft && availableSpace % 2 !== 0) {
        leftLength++;
        rightLength--;
    }
    // Ensure minimum context if possible
    if (leftLength < minContext && prefix.length > leftLength) {
        const diff = Math.min(rightLength - minContext, minContext - leftLength);
        if (diff > 0) {
            leftLength += diff;
            rightLength -= diff;
        }
    }
    else if (rightLength < minContext && suffix.length > rightLength) {
        const diff = Math.min(leftLength - minContext, minContext - rightLength);
        if (diff > 0) {
            rightLength += diff;
            leftLength -= diff;
        }
    }
    // Build result
    const left = prefix.length > leftLength ? ellipsis + prefix.slice(-leftLength) : prefix;
    const right = suffix.length > rightLength
        ? suffix.slice(0, rightLength) + ellipsis
        : suffix;
    return { prefix: left, suffix: right };
}
function stringToMatch(str) {
    return [
        {
            prefix: str,
            match: "",
            suffix: "",
            id: undefined
        }
    ];
}
function highlightHtmlContent(html, queries) {
    if (!html || !queries.length)
        return html;
    // Filter and escape regex special chars (tokens are already diacritics-normalized)
    const patterns = queries
        .filter((q) => q && q.length > 0)
        .map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!patterns.length)
        return html;
    // Create single regex for all patterns
    const searchRegex = new RegExp(`(${patterns.join("|")})`, "gi");
    let result = "";
    let matchIdCounter = 0;
    const elementStack = [];
    // Create parser instance
    const parser = new htmlparser2_1.Parser({
        ontext(text) {
            const normalizedText = removeDiacritics(text);
            const highlighted = highlightRegexMatches(text, normalizedText, searchRegex, matchIdCounter);
            matchIdCounter = highlighted.nextId;
            if (highlighted.hasMatches) {
                // Mark all ancestor elements as containing a match
                elementStack.forEach((el) => (el.hasMatch = true));
            }
            // Add text to current element's buffer or main result
            if (elementStack.length > 0) {
                elementStack[elementStack.length - 1].buffer += highlighted.result;
            }
            else {
                result += highlighted.result;
            }
        },
        onopentag(name, attributes) {
            // Create new element info
            elementStack.push({
                name,
                attributes: Object.assign({}, attributes),
                hasMatch: false,
                buffer: ""
            });
        },
        onclosetag(_name) {
            const element = elementStack.pop();
            if (!element)
                return;
            let html = `<${element.name}`;
            // Process attributes based on match status
            for (const [key, value] of Object.entries(element.attributes)) {
                // auto expand outline list item if it has matches
                if (element.name === "li" &&
                    key === "data-collapsed" &&
                    element.hasMatch) {
                    continue;
                }
                // auto expand callout if it has matches
                if (element.name === "div" &&
                    key === "class" &&
                    (value === null || value === void 0 ? void 0 : value.includes("callout")) &&
                    element.hasMatch) {
                    html += ` ${key}="callout"`;
                    continue;
                }
                html += ` ${key}="${value}"`;
            }
            html += `>${element.buffer}</${element.name}>`;
            // Add to parent's buffer or main result
            if (elementStack.length > 0) {
                elementStack[elementStack.length - 1].buffer += html;
            }
            else {
                result += html;
            }
        },
        onprocessinginstruction(_name, data) {
            if (elementStack.length > 0) {
                elementStack[elementStack.length - 1].buffer += `<${data}>`;
            }
            else {
                result += `<${data}>`;
            }
        }
    }, {
        decodeEntities: true,
        xmlMode: false
    });
    // Parse the HTML
    parser.write(html);
    parser.end();
    return result;
}
const DEFAULT_SCORE_OPTIONS = {
    lengthMultiplier: 1.5, // Favor longer matches
    positionPenalty: 0.05, // Small penalty for each position down
    consecutiveBonus: 2.0, // Bonus for consecutive different tokens
    repetitionPenalty: 0.5, // Significant penalty for repetition
    uniqueTokenBonus: 10.0, // Large bonus for each unique token
    completeWordBonus: 5.0 // Significant bonus for complete word matches
};
function isCompleteWord(match) {
    const prefixEndsWithSpace = /\s$/.test(match.prefix) || match.prefix === "";
    const suffixStartsWithSpace = /^\s/.test(match.suffix) || match.suffix === "";
    return prefixEndsWithSpace && suffixStartsWithSpace;
}
function getMatchScore(matches, tokens, options = DEFAULT_SCORE_OPTIONS) {
    let score = 0;
    let lastMatchText = "";
    let repetitionCount = 0;
    const uniqueTokens = new Set();
    matches.forEach((match, index) => {
        const matchText = match.match.toLowerCase();
        let matchScore = 0;
        // Get matching tokens for this match
        const matchingTokens = tokens.filter((token) => matchText.includes(token.toLowerCase()));
        // Add to unique tokens set
        matchingTokens.forEach((token) => {
            uniqueTokens.add(token.toLowerCase());
        });
        // Base score from match length
        matchScore += match.match.length * options.lengthMultiplier;
        // Check if it's a complete word only once per match
        if (isCompleteWord(match)) {
            matchScore += options.completeWordBonus;
        }
        // Position penalty
        matchScore *= 1 - index * options.positionPenalty;
        // Handle consecutive matches and repetition
        if (index > 0) {
            if (matchText === lastMatchText) {
                repetitionCount++;
                matchScore *= Math.pow(options.repetitionPenalty, repetitionCount);
            }
            else {
                matchScore *= options.consecutiveBonus;
                repetitionCount = 0;
            }
        }
        lastMatchText = matchText;
        score += matchScore;
    });
    // Add unique token bonus once at the end
    score += uniqueTokens.size * options.uniqueTokenBonus;
    return score;
}
function filterSmallTokens(tokens) {
    if (!tokens)
        return;
    return [...tokens.andTokens, ...tokens.orTokens].filter((token) => token.length < 3);
}
function transformTokens(tokens) {
    if (!tokens)
        return {
            andTokens: [],
            orTokens: [],
            notTokens: [],
            allTokens: []
        };
    const andTokens = tokens.andTokens.map((t) => removeDiacritics(t.replace(/"(.+)"/g, "$1").toLowerCase()));
    const orTokens = tokens.orTokens.map((t) => removeDiacritics(t.replace(/"(.+)"/g, "$1").toLowerCase()));
    const notTokens = tokens.notTokens.map((t) => removeDiacritics(t.replace(/"(.+)"/g, "$1").toLowerCase()));
    return {
        andTokens,
        orTokens,
        notTokens,
        allTokens: [...andTokens, ...orTokens]
    };
}
function createSearchResultTag(content, id) {
    return `<${MATCH_TAG_NAME} id="${id}">${content}</${MATCH_TAG_NAME}>`;
}
function highlightRegexMatches(text, normalizedText, regex, startId) {
    let matchIdCounter = startId;
    let hasMatches = false;
    let result = "";
    let lastIndex = 0;
    let m;
    while ((m = regex.exec(normalizedText)) !== null) {
        hasMatches = true;
        result += text.slice(lastIndex, m.index);
        result += createSearchResultTag(text.slice(m.index, m.index + m[0].length), `match-${++matchIdCounter}`);
        lastIndex = m.index + m[0].length;
    }
    result += text.slice(lastIndex);
    return { result, hasMatches, nextId: matchIdCounter };
}
function removeDiacritics(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
