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
const types_js_1 = require("../types.js");
const constants_js_1 = __importDefault(require("../utils/constants.js"));
const http_js_1 = __importDefault(require("../utils/http.js"));
class Subscriptions {
    constructor(db) {
        this.db = db;
    }
    cancel() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            const user = yield this.db.user.getUser();
            if (!token || !user)
                return;
            const endpoint = isLegacySubscription(user)
                ? `subscriptions/cancel`
                : `subscriptions/v2/cancel`;
            yield http_js_1.default.post(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/${endpoint}`, null, token);
        });
    }
    pause() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            const user = yield this.db.user.getUser();
            if (!token || !user)
                return;
            const endpoint = isLegacySubscription(user)
                ? `subscriptions?pause=true`
                : `subscriptions/v2/pause`;
            if (isLegacySubscription(user))
                yield http_js_1.default.delete(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/${endpoint}`, token);
            else
                yield http_js_1.default.post(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/${endpoint}`, null, token);
        });
    }
    resume() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            const user = yield this.db.user.getUser();
            if (!token || !user)
                return;
            const endpoint = isLegacySubscription(user)
                ? `subscriptions/resume`
                : `subscriptions/v2/resume`;
            yield http_js_1.default.post(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/${endpoint}`, null, token);
        });
    }
    refund(reason) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            const user = yield this.db.user.getUser();
            if (!token || !user)
                return;
            const endpoint = isLegacySubscription(user)
                ? `subscriptions/refund`
                : `subscriptions/v2/refund`;
            yield http_js_1.default.post(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/${endpoint}`, { reason }, token);
        });
    }
    transactions() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            const user = yield this.db.user.getUser();
            if (!token || !user)
                return;
            if (isLegacySubscription(user)) {
                return {
                    type: "v1",
                    transactions: yield http_js_1.default.get(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/subscriptions/transactions`, token)
                };
            }
            else {
                return {
                    type: "v2",
                    transactions: yield http_js_1.default.get(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/subscriptions/v2/transactions`, token)
                };
            }
        });
    }
    invoice(transactionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            if (!token)
                return;
            const response = yield http_js_1.default.get(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/subscriptions/v2/invoice?transactionId=${transactionId}`, token);
            return response.url;
        });
    }
    updateUrl() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            if (!token)
                return;
            const user = yield this.db.user.getUser();
            if (!token || !user)
                return;
            if (isLegacySubscription(user)) {
                return yield http_js_1.default.get(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/subscriptions/update`, token);
            }
            else {
                const result = yield http_js_1.default.get(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/subscriptions/v2/urls`, token);
                return result.update_payment_method;
            }
        });
    }
    redeemCode(code) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            if (!token)
                return;
            return http_js_1.default.post.json(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/subscriptions/redeem`, {
                code
            }, token);
        });
    }
    checkoutUrl(plan, period) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.db.user.getUser();
            if (!user)
                return;
            return `${constants_js_1.default.NOTESNOOK_HOST}/api/v2/checkout?userId=${user.id}&email=${user.email}&plan=${(0, types_js_1.planToId)(plan)}&period=${period}`;
        });
    }
    preview(productId) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            if (!token)
                return;
            return http_js_1.default.post(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/subscriptions/v2/preview`, {
                productId: productId
            }, token);
        });
    }
    change(productId) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.db.tokenManager.getAccessToken();
            if (!token)
                return;
            return http_js_1.default.post(`${constants_js_1.default.SUBSCRIPTIONS_HOST}/subscriptions/v2/change`, {
                productId: productId
            }, token);
        });
    }
}
exports.default = Subscriptions;
function isLegacySubscription(user) {
    return (user.subscription.plan === types_js_1.SubscriptionPlan.LEGACY_PRO &&
        user.subscription.status !== types_js_1.SubscriptionStatus.EXPIRED);
}
