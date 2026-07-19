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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxApiKeys = void 0;
const http_js_1 = __importDefault(require("../utils/http.js"));
const constants_js_1 = __importDefault(require("../utils/constants.js"));
const ENDPOINTS = {
    inboxApiKeys: "/inbox/api-keys"
};
class InboxApiKeys {
    constructor(db, tokenManager) {
        this.db = db;
        this.tokenManager = tokenManager;
    }
    get() {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.db.user.getUser();
            if (!user)
                return;
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            const inboxApiKeys = yield http_js_1.default.get(`${constants_js_1.default.API_HOST}${ENDPOINTS.inboxApiKeys}`, token);
            return inboxApiKeys;
        });
    }
    revoke(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.db.user.getUser();
            if (!user)
                return;
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            yield http_js_1.default.delete(`${constants_js_1.default.API_HOST}${ENDPOINTS.inboxApiKeys}/${key}`, token);
        });
    }
    create(name, expiryDuration) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.db.user.getUser();
            if (!user)
                return;
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            const payload = {
                name,
                expiryDate: expiryDuration === -1 ? -1 : Date.now() + expiryDuration
            };
            yield http_js_1.default.post.json(`${constants_js_1.default.API_HOST}${ENDPOINTS.inboxApiKeys}`, payload, token);
        });
    }
}
exports.InboxApiKeys = InboxApiKeys;
