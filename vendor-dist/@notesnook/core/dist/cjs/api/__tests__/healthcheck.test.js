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
const healthcheck_js_1 = require("../healthcheck.js");
const vitest_1 = require("vitest");
vitest_1.describe.concurrent("Health check", (test) => {
    test("Auth", (t) => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield healthcheck_js_1.HealthCheck.auth();
        t.expect(result).toBe(true);
    }));
    test("Healthy host", (t) => __awaiter(void 0, void 0, void 0, function* () {
        const host = "https://api.notesnook.com";
        const result = yield (0, healthcheck_js_1.check)(host);
        t.expect(result).toBe(true);
    }));
    test("Unhealthy host", (t) => __awaiter(void 0, void 0, void 0, function* () {
        const host = "https://example.com";
        // Simulate an error by passing an invalid host
        const result = yield (0, healthcheck_js_1.check)(host);
        t.expect(result).toBe(false);
    }));
});
