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
const http_js_1 = __importDefault(require("../utils/http.js"));
const constants_js_1 = __importDefault(require("../utils/constants.js"));
const common_js_1 = require("../common.js");
const async_mutex_1 = require("async-mutex");
const logger_js_1 = require("../logger.js");
const SCOPES = [
    "notesnook.sync",
    "offline_access",
    "IdentityServerApi",
    "auth:grant_types:mfa",
    "auth:grant_types:mfa_password"
];
const ENDPOINTS = {
    token: "/connect/token",
    revoke: "/connect/revocation",
    temporaryToken: "/account/token",
    logout: "/account/logout"
};
class TokenManager {
    constructor(storage, eventManager) {
        this.storage = storage;
        this.eventManager = eventManager;
        this.logger = logger_js_1.logger.scope("TokenManager");
        this.REFRESH_TOKEN_MUTEX = (0, async_mutex_1.withTimeout)(new async_mutex_1.Mutex(), 10 * 1000, new Error("Timed out while refreshing access token."));
    }
    getToken() {
        return __awaiter(this, arguments, void 0, function* (renew = true, forceRenew = false) {
            const token = yield this.storage().read("token");
            if (!token || !token.access_token)
                return;
            this.logger.info("Access token requested", {
                accessToken: token.access_token.slice(0, 10)
            });
            const isExpired = renew && this._isTokenExpired(token);
            if (this._isTokenRefreshable(token) && (forceRenew || isExpired)) {
                yield this._refreshToken(forceRenew);
                return yield this.getToken(false, false);
            }
            return token;
        });
    }
    _isTokenExpired(token) {
        const { t, expires_in } = token;
        const expiryMs = t + expires_in * 1000;
        return Date.now() >= expiryMs;
    }
    _isTokenRefreshable(token) {
        const { scope, refresh_token } = token;
        if (!refresh_token || !scope)
            return false;
        const scopes = scope.split(" ");
        return scopes.includes("offline_access") && Boolean(refresh_token);
    }
    getAccessToken() {
        return __awaiter(this, arguments, void 0, function* (scopes = ["notesnook.sync", "IdentityServerApi"], forceRenew = false) {
            return yield getSafeToken(() => __awaiter(this, void 0, void 0, function* () {
                const token = yield this.getToken(true, forceRenew);
                if (!token || !token.scope)
                    return;
                if (!scopes.some((s) => token.scope.includes(s)))
                    return;
                return token.access_token;
            }), "Error getting access token:", this.eventManager);
        });
    }
    _refreshToken() {
        return __awaiter(this, arguments, void 0, function* (forceRenew = false) {
            yield this.REFRESH_TOKEN_MUTEX.runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                this.logger.info("Refreshing access token");
                const token = yield this.getToken(false, false);
                if (!token)
                    throw new Error("No access token found to refresh.");
                if (!forceRenew && !this._isTokenExpired(token)) {
                    return;
                }
                const { refresh_token, scope } = token;
                if (!refresh_token || !scope) {
                    this.eventManager.publish(common_js_1.EVENTS.userSessionExpired);
                    this.logger.error(new Error("Token not found."));
                    return;
                }
                const refreshTokenResponse = yield http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.token}`, {
                    refresh_token,
                    grant_type: "refresh_token",
                    scope: scope,
                    client_id: "notesnook"
                });
                yield this.saveToken(refreshTokenResponse);
                this.eventManager.publish(common_js_1.EVENTS.tokenRefreshed);
            }));
        });
    }
    revokeToken() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.getToken();
            if (!token)
                return;
            const { access_token } = token;
            yield this.storage().delete("token");
            yield http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.logout}`, null, access_token);
        });
    }
    saveToken(tokenResponse) {
        this.logger.info("Saving new token");
        if (!tokenResponse || !tokenResponse.access_token)
            return;
        const token = Object.assign(Object.assign({}, tokenResponse), { t: Date.now() });
        return this.storage().write("token", token);
    }
    getAccessTokenFromAuthorizationCode(userId, authCode) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.saveToken(yield http_js_1.default.post(`${constants_js_1.default.AUTH_HOST}${ENDPOINTS.temporaryToken}`, {
                authorization_code: authCode,
                user_id: userId,
                client_id: "notesnook"
            }));
        });
    }
}
exports.default = TokenManager;
function getSafeToken(action, errorMessage, eventManager) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield action();
        }
        catch (e) {
            logger_js_1.logger.error(e, errorMessage);
            if (e instanceof Error &&
                (e.message === "invalid_grant" || e.message === "invalid_client")) {
                eventManager.publish(common_js_1.EVENTS.userSessionExpired);
            }
            throw e;
        }
    });
}
