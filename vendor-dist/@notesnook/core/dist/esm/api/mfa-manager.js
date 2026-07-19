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
import http from "../utils/http.js";
import constants from "../utils/constants.js";
const ENDPOINTS = {
    setup: "/mfa",
    enable: "/mfa",
    disable: "/mfa",
    recoveryCodes: "/mfa/codes",
    send: "/mfa/send"
};
class MFAManager {
    constructor(tokenManager) {
        this.tokenManager = tokenManager;
    }
    setup(type, phoneNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            return yield http.post(`${constants.AUTH_HOST}${ENDPOINTS.setup}`, {
                type,
                phoneNumber
            }, token);
        });
    }
    enable(type, code) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._enable(type, code, false);
        });
    }
    /**
     *
     * @param {"app" | "sms" | "email"} type
     * @param {string} code
     * @returns
     */
    enableFallback(type, code) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._enable(type, code, true);
        });
    }
    _enable(type, code, isFallback) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            return yield http.patch(`${constants.AUTH_HOST}${ENDPOINTS.enable}`, { type, code, isFallback }, token);
        });
    }
    disable() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            return yield http.delete(`${constants.AUTH_HOST}${ENDPOINTS.disable}`, token);
        });
    }
    codes() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken();
            if (!token)
                return;
            return yield http.get(`${constants.AUTH_HOST}${ENDPOINTS.recoveryCodes}`, token);
        });
    }
    sendCode(method) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.tokenManager.getAccessToken([
                "IdentityServerApi",
                "auth:grant_types:mfa"
            ]);
            if (!token)
                throw new Error("Unauthorized.");
            return yield http.post(`${constants.AUTH_HOST}${ENDPOINTS.send}`, {
                type: method
            }, token);
        });
    }
}
export default MFAManager;
