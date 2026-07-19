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
import { Parser } from "htmlparser2";
import { countWords } from "alfaaz";
import { isFalse } from "../database/index.js";
const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
];
const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];
export class Wrapped {
    constructor(db) {
        this.db = db;
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            const { startDate, endDate } = this.getYearRange();
            const [noteStats, organizationStats, attachmentStats] = yield Promise.all([
                this.getNoteStats(startDate, endDate),
                this.getOrganizationStats(startDate, endDate),
                this.getAttachmentStats(startDate, endDate)
            ]);
            return Object.assign(Object.assign(Object.assign({}, noteStats), organizationStats), attachmentStats);
        });
    }
    getYearRange() {
        const year = new Date().getFullYear();
        const startDate = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
        const endDate = new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime();
        return { startDate, endDate };
    }
    getNoteStats(startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const notesSelector = this.db
                .sql()
                .selectFrom("notes")
                .where((eb) => eb("dateCreated", ">=", startDate))
                .where((eb) => eb("dateCreated", "<", endDate))
                .where(isFalse("deleted"))
                .where(isFalse("dateDeleted"));
            const notes = yield notesSelector.select(["notes.dateCreated"]).execute();
            const monthlyStats = new Map();
            const dayOfWeekStats = new Map();
            let totalNotes = 0;
            for (const note of notes) {
                if (!note.dateCreated)
                    continue;
                totalNotes++;
                const month = new Date(note.dateCreated).getMonth();
                const monthName = monthNames[month];
                monthlyStats.set(monthName, (monthlyStats.get(monthName) || 0) + 1);
                const dayOfWeek = new Date(note.dateCreated).getDay();
                const dayName = dayNames[dayOfWeek];
                dayOfWeekStats.set(dayName, (dayOfWeekStats.get(dayName) || 0) + 1);
            }
            let mostNotesCreatedInMonth = null;
            for (const [month, count] of monthlyStats.entries()) {
                if (!mostNotesCreatedInMonth || count > mostNotesCreatedInMonth.count) {
                    mostNotesCreatedInMonth = { month, count };
                }
            }
            let mostNotesCreatedInDay = null;
            let maxDayCount = 0;
            for (const [day, count] of dayOfWeekStats.entries()) {
                if (count > maxDayCount) {
                    maxDayCount = count;
                    mostNotesCreatedInDay = { day, count };
                }
            }
            const totalMonographs = yield this.db.monographs.all
                .where((eb) => eb.and([
                eb("dateCreated", ">=", startDate),
                eb("dateCreated", "<", endDate)
            ]))
                .count();
            const { largestNote, totalWords } = yield this.countTotalWords(notesSelector);
            return {
                totalNotes,
                totalWords,
                totalMonographs,
                largestNote: largestNote
                    ? {
                        title: ((_a = (yield this.db.notes.note(largestNote.id))) === null || _a === void 0 ? void 0 : _a.title) || "",
                        length: largestNote.wordCount
                    }
                    : null,
                monthlyStats: Object.fromEntries(monthlyStats),
                dayOfWeekStats: Object.fromEntries(dayOfWeekStats),
                mostNotesCreatedInMonth,
                mostNotesCreatedInDay
            };
        });
    }
    countItemNotes(items, itemType) {
        return __awaiter(this, void 0, void 0, function* () {
            const allRelations = yield this.db.relations
                .from({ ids: items.map((item) => item.id), type: itemType }, "note")
                .get();
            const noteCounts = new Map();
            for (const relation of allRelations) {
                const itemId = relation.fromId;
                noteCounts.set(itemId, (noteCounts.get(itemId) || 0) + 1);
            }
            return items
                .map((item) => (Object.assign(Object.assign({}, item), { noteCount: noteCounts.get(item.id) || 0 })))
                .filter((item) => item.noteCount > 0)
                .sort((a, b) => b.noteCount - a.noteCount);
        });
    }
    getOrganizationStats(startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            const notebookSelector = this.db.notebooks.all
                .where((eb) => eb("dateCreated", ">=", startDate))
                .where((eb) => eb("dateCreated", "<", endDate));
            const tagSelector = this.db.tags.all
                .where((eb) => eb("dateCreated", ">=", startDate))
                .where((eb) => eb("dateCreated", "<", endDate));
            const [totalNotebooks, totalTags, tags, notebooks, totalColors] = yield Promise.all([
                notebookSelector.count(),
                tagSelector.count(),
                tagSelector.fields(["tags.id", "tags.title"]).items(),
                notebookSelector.fields(["notebooks.id", "notebooks.title"]).items(),
                this.db.colors.all
                    .where((eb) => eb("dateCreated", ">=", startDate))
                    .where((eb) => eb("dateCreated", "<", endDate))
                    .count()
            ]);
            const tagNotes = yield this.countItemNotes(tags, "tag");
            const mostUsedTags = tagNotes.slice(0, 3);
            const notebookNotes = yield this.countItemNotes(notebooks, "notebook");
            const mostActiveNotebooks = notebookNotes.slice(0, 3);
            return {
                totalNotebooks,
                totalTags,
                mostUsedTags: mostUsedTags.length > 0
                    ? mostUsedTags
                    : tags.slice(0, 3).map((tag) => (Object.assign(Object.assign({}, tag), { noteCount: 0 }))),
                mostActiveNotebooks: mostActiveNotebooks.length > 0
                    ? mostActiveNotebooks
                    : notebooks.slice(0, 3).map((n) => (Object.assign(Object.assign({}, n), { noteCount: 0 }))),
                totalColors
            };
        });
    }
    getAttachmentStats(startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            const attachmentsSelector = this.db.attachments.all
                .where((eb) => eb("dateCreated", ">=", startDate))
                .where((eb) => eb("dateCreated", "<", endDate));
            const totalAttachments = yield attachmentsSelector.count();
            if (totalAttachments === 0) {
                return {
                    totalAttachments: 0,
                    totalStorageUsed: 0,
                    largestAttachment: null,
                    mostCommonFileType: null
                };
            }
            const totalStorageUsed = (yield this.db.attachments.totalSize(attachmentsSelector)) || 0;
            const attachments = yield attachmentsSelector.items();
            let largestAttachment = null;
            const mimeTypeCounts = new Map();
            for (const attachment of attachments) {
                if (!largestAttachment || attachment.size > largestAttachment.size) {
                    largestAttachment = {
                        id: attachment.id,
                        filename: attachment.filename,
                        size: attachment.size
                    };
                }
                const mimeType = attachment.mimeType.split("/")[0] || attachment.mimeType;
                mimeTypeCounts.set(mimeType, (mimeTypeCounts.get(mimeType) || 0) + 1);
            }
            let mostCommonFileType = null;
            let maxCount = 0;
            for (const [mimeType, count] of mimeTypeCounts.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    mostCommonFileType = mimeType;
                }
            }
            return {
                totalAttachments,
                totalStorageUsed,
                largestAttachment,
                mostCommonFileType
            };
        });
    }
    countTotalWords(selector) {
        return __awaiter(this, void 0, void 0, function* () {
            let words = 0;
            let largestNote = { id: "", wordCount: 0 };
            const contents = yield this.db
                .sql()
                .selectFrom("content")
                .where("noteId", "in", selector.select("id"))
                .where(isFalse("locked"))
                .where(isFalse("deleted"))
                .select(["content.data", "content.noteId"])
                .execute();
            for (const content of contents) {
                if (typeof (content === null || content === void 0 ? void 0 : content.data) !== "string")
                    continue;
                const counted = countWords(toTextContent(content.data));
                words += counted;
                if (content.noteId && counted > largestNote.wordCount) {
                    largestNote = { id: content.noteId, wordCount: counted };
                }
            }
            return { totalWords: words, largestNote };
        });
    }
}
function toTextContent(html) {
    let text = "";
    const parser = new Parser({
        ontext: (data) => {
            text += data;
        },
        onclosetag() {
            text += " ";
        }
    });
    parser.write(html);
    parser.end();
    return text;
}
