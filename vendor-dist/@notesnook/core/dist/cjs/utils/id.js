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
exports.getId = getId;
exports.makeId = makeId;
exports.makeSessionContentId = makeSessionContentId;
const spark_md5_1 = __importDefault(require("spark-md5"));
const object_id_js_1 = require("./object-id.js");
function getId(time) {
    return (0, object_id_js_1.createObjectId)(time);
}
function makeId(text) {
    return spark_md5_1.default.hash(text);
}
function makeSessionContentId(sessionId) {
    return sessionId + "_content";
}
