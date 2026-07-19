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
exports.RequestError = void 0;
exports.errorTransformer = errorTransformer;
const common_js_1 = require("../common.js");
const logger_js_1 = require("../logger.js");
const constants_js_1 = require("./constants.js");
const hostname_js_1 = require("./hostname.js");
function get(url, token) {
    return request(url, "GET", token);
}
function deleteRequest(url, token) {
    return request(url, "DELETE", token);
}
function patch(url, data, token) {
    return bodyRequest(url, transformFormData(data), token, "PATCH");
}
patch.json = function (url, data, token) {
    return bodyRequest(url, transformJson(data), token, "PATCH", "application/json");
};
function post(url, data, token) {
    return bodyRequest(url, transformFormData(data), token, "POST");
}
post.json = function (url, data, token) {
    return bodyRequest(url, transformJson(data), token, "POST", "application/json");
};
exports.default = {
    get,
    post,
    delete: deleteRequest,
    patch
};
function request(url, method, token) {
    return __awaiter(this, void 0, void 0, function* () {
        return handleResponse(yield fetchWrapped(url, {
            method,
            headers: getHeaders(token)
        }));
    });
}
function bodyRequest(url_1, data_1, token_1, method_1) {
    return __awaiter(this, arguments, void 0, function* (url, data, token, method, contentType = "application/x-www-form-urlencoded") {
        return handleResponse(yield fetchWrapped(url, {
            method,
            body: data,
            headers: Object.assign(Object.assign({}, getHeaders(token)), { "Content-Type": contentType })
        }));
    });
}
function errorTransformer(errorJson) {
    let errorMessage = "Unknown error.";
    let errorCode = "unknown";
    if (!errorJson.error && !errorJson.errors && !errorJson.error_description)
        return { description: errorMessage, code: errorCode, data: {} };
    const { error, error_description, errors, data } = errorJson;
    if (errors) {
        errorMessage = errors.join("\n");
    }
    outer: switch (error) {
        case "invalid_grant": {
            switch (error_description) {
                case "invalid_username_or_password":
                    errorMessage = "Username or password incorrect.";
                    errorCode = error_description;
                    break outer;
                default:
                    errorMessage = error_description || error;
                    errorCode = error || "invalid_grant";
                    break outer;
            }
        }
        default:
            errorMessage = error_description || error || errorMessage;
            errorCode = error || errorCode;
            break;
    }
    return {
        description: errorMessage,
        code: errorCode,
        data: data ? JSON.parse(data) : undefined
    };
}
function fetchWrapped(input, init) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(input, init);
            return response;
        }
        catch (e) {
            const host = (0, hostname_js_1.extractHostname)(input);
            const serverName = (0, constants_js_1.getServerNameFromHost)(host);
            if (serverName)
                throw new Error(`${serverName} is not responding. Please check your internet connection. If the problem persists, feel free email us at support@streetwriters.co. (Reference error: ${e.message})`);
            throw e;
        }
    });
}
function handleResponse(response) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const json = yield response.json();
                if (response.ok) {
                    return json;
                }
                throw new RequestError(errorTransformer(json));
            }
            else {
                if (response.status === 429)
                    throw new Error("You are being rate limited.");
                if (response.ok)
                    return yield response.text();
                else if (response.status === 401) {
                    common_js_1.EV.publish(common_js_1.EVENTS.userUnauthorized, response.url);
                    throw new Error("Unauthorized.");
                }
                else
                    throw new Error(`Request failed with status code: ${response.status} ${response.url} ${yield response.text()}.`);
            }
        }
        catch (e) {
            logger_js_1.logger.error(e, "Error while sending request:", {
                url: response.url,
                body: response.bodyUsed ? undefined : yield response.text()
            });
            throw e;
        }
    });
}
class RequestError extends Error {
    constructor(error) {
        super(error.description);
        this.code = error.code;
        this.data = error.data;
    }
}
exports.RequestError = RequestError;
function getHeaders(token) {
    return token ? { Authorization: "Bearer " + token } : undefined;
}
function transformJson(data) {
    return JSON.stringify(data);
}
function transformFormData(data) {
    if (data) {
        return Object.entries(data)
            .map(([key, value]) => value
            ? `${encodeURIComponent(key)}=${value ? encodeURIComponent(value) : ""}`
            : "")
            .join("&");
    }
}
