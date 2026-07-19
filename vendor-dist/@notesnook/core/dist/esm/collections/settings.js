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
import { makeId } from "../utils/id.js";
import { SQLCachedCollection } from "../database/sql-cached-collection.js";
const DEFAULT_GROUP_OPTIONS = (key) => ({
    groupBy: key === "search" ? "none" : "default",
    sortBy: key === "search"
        ? "relevance"
        : key === "trash"
            ? "dateDeleted"
            : key === "tags"
                ? "dateCreated"
                : key === "reminders"
                    ? "dueDate"
                    : "dateEdited",
    sortDirection: key === "reminders" ? "asc" : "desc"
});
const defaultSettings = {
    timeFormat: "12-hour",
    dayFormat: "short",
    dateFormat: "DD-MM-YYYY",
    weekFormat: "Sun",
    titleFormat: "Note $date$ $time$",
    defaultNotebook: undefined,
    defaultTag: undefined,
    trashCleanupInterval: 7,
    profile: undefined,
    "vault:lockAfter": 1000 * 60 * 30,
    "groupOptions:notes:notebooks": {},
    "groupOptions:notes:tags": {},
    "groupOptions:notes:colors": {},
    "groupOptions:trash": DEFAULT_GROUP_OPTIONS("trash"),
    "groupOptions:tags": DEFAULT_GROUP_OPTIONS("tags"),
    "groupOptions:notes": DEFAULT_GROUP_OPTIONS("notes"),
    "groupOptions:notebooks": DEFAULT_GROUP_OPTIONS("notebooks"),
    "groupOptions:favorites": DEFAULT_GROUP_OPTIONS("favorites"),
    "groupOptions:archive": DEFAULT_GROUP_OPTIONS("archive"),
    "groupOptions:home": DEFAULT_GROUP_OPTIONS("home"),
    "groupOptions:reminders": DEFAULT_GROUP_OPTIONS("reminders"),
    "groupOptions:search": DEFAULT_GROUP_OPTIONS("search"),
    "toolbarConfig:desktop": undefined,
    "toolbarConfig:mobile": undefined,
    "toolbarConfig:tablet": undefined,
    "toolbarConfig:smallTablet": undefined,
    "sideBarOrder:routes": [],
    "sideBarOrder:colors": [],
    "sideBarOrder:shortcuts": [],
    "sideBarHiddenItems:routes": [],
    "sideBarHiddenItems:colors": []
};
// since setting keys are static, we can calculate ids for them
// once instead of on each get/set. This can be further optimized
// by generating the ids at build time.
const KEY_IDS = Object.fromEntries(Object.keys(defaultSettings).map((key) => [key, makeId(key)]));
export class Settings {
    constructor(db) {
        this.name = "settings";
        this.collection = new SQLCachedCollection(db.sql, db.transaction, "settings", db.eventManager, db.sanitizer);
    }
    init() {
        return this.collection.init();
    }
    set(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = KEY_IDS[key];
            if (!id)
                throw new Error(`Invalid settings key: ${key}.`);
            const oldItem = this.collection.get(id);
            if (oldItem && oldItem.key !== key)
                throw new Error("Key conflict.");
            yield this.collection.upsert({
                id,
                key,
                value,
                type: "settingitem",
                dateCreated: (oldItem === null || oldItem === void 0 ? void 0 : oldItem.dateCreated) || Date.now(),
                dateModified: (oldItem === null || oldItem === void 0 ? void 0 : oldItem.dateCreated) || Date.now()
            });
            return id;
        });
    }
    get(key) {
        const item = this.collection.get(KEY_IDS[key]);
        if (!item || item.key !== key)
            return defaultSettings[key];
        return item.value;
    }
    getGroupOptions(key) {
        return this.get(`groupOptions:${key}`);
    }
    setGroupOptions(key, groupOptions) {
        return this.set(`groupOptions:${key}`, groupOptions);
    }
    setGroupOptionsById(id, type, groupOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const groupOptionsKey = type === "notebook"
                ? "groupOptions:notes:notebooks"
                : type === "tag"
                    ? "groupOptions:notes:tags"
                    : "groupOptions:notes:colors";
            const groupOptionsMap = this.get(groupOptionsKey);
            groupOptionsMap[id] = groupOptions;
            return this.set(groupOptionsKey, groupOptionsMap);
        });
    }
    getGroupOptionsById(id, type) {
        const groupOptions = this.get(type === "notebook"
            ? "groupOptions:notes:notebooks"
            : type === "tag"
                ? "groupOptions:notes:tags"
                : "groupOptions:notes:colors");
        return groupOptions[id] || this.get("groupOptions:notes");
    }
    setToolbarConfig(platform, config) {
        return this.set(`toolbarConfig:${platform}`, config);
    }
    getToolbarConfig(platform) {
        return this.get(`toolbarConfig:${platform}`);
    }
    setTrashCleanupInterval(interval) {
        return this.set("trashCleanupInterval", interval);
    }
    getTrashCleanupInterval() {
        const t = this.get("trashCleanupInterval");
        // stored as a string in db, need conversion before use
        return Number(t);
    }
    setDefaultNotebook(item) {
        return this.set("defaultNotebook", item);
    }
    getDefaultNotebook() {
        return this.get("defaultNotebook");
    }
    setDefaultTag(item) {
        return this.set("defaultTag", item);
    }
    getDefaultTag() {
        return this.get("defaultTag");
    }
    setTitleFormat(format) {
        return this.set("titleFormat", format);
    }
    getTitleFormat() {
        return this.get("titleFormat");
    }
    getDateFormat() {
        return this.get("dateFormat");
    }
    setDateFormat(format) {
        return this.set("dateFormat", format);
    }
    getTimeFormat() {
        return this.get("timeFormat");
    }
    setTimeFormat(format) {
        return this.set("timeFormat", format);
    }
    getDayFormat() {
        return this.get("dayFormat");
    }
    setDayFormat(format) {
        return this.set("dayFormat", format);
    }
    getWeekFormat() {
        return this.get("weekFormat");
    }
    setWeekFormat(format) {
        return this.set("weekFormat", format);
    }
    getSideBarOrder(section) {
        return this.get(`sideBarOrder:${section}`);
    }
    setSideBarOrder(section, order) {
        return this.set(`sideBarOrder:${section}`, order);
    }
    getSideBarHiddenItems(section) {
        return this.get(`sideBarHiddenItems:${section}`);
    }
    setSideBarHiddenItems(section, ids) {
        return this.set(`sideBarHiddenItems:${section}`, ids);
    }
    getProfile() {
        return this.get("profile");
    }
    setProfile(partial) {
        const profile = !partial ? undefined : Object.assign(Object.assign({}, this.getProfile()), partial);
        return this.set("profile", profile);
    }
    getVaultLockAfter() {
        return this.get("vault:lockAfter");
    }
    setVaultLockAfter(ms) {
        return this.set("vault:lockAfter", ms);
    }
}
