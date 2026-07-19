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
Object.defineProperty(exports, "__esModule", { value: true });
const data_urls_1 = require("@readme/data-urls");
function toObject(dataurl) {
    const result = (0, data_urls_1.parse)(dataurl);
    if (!result)
        return {};
    return {
        mimeType: result.contentType,
        data: result.data
    };
}
function fromObject({ mimeType, data }) {
    if ((0, data_urls_1.validate)(data))
        return data;
    return `data:${mimeType};base64,${data}`;
}
function isValid(url) {
    return (0, data_urls_1.validate)(url);
}
const dataurl = { toObject, fromObject, isValid };
exports.default = dataurl;
