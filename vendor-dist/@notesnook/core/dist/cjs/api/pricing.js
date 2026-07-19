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
exports.Pricing = void 0;
const constants_js_1 = __importDefault(require("../utils/constants.js"));
const http_js_1 = __importDefault(require("../utils/http.js"));
class Pricing {
    static sku(platform, period, plan) {
        return http_js_1.default.get(`${constants_js_1.default.NOTESNOOK_HOST}/api/v2/prices/skus?platform=${platform}&period=${period}&plan=${plan}`);
    }
    static products(trialsAvailed) {
        const url = new URL(`${constants_js_1.default.NOTESNOOK_HOST}/api/v2/prices/products`);
        if (trialsAvailed)
            url.searchParams.set("trialsAvailed", trialsAvailed.join(","));
        return http_js_1.default.get(url.toString());
    }
}
exports.Pricing = Pricing;
