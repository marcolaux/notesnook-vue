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
exports.isHTMLEqual = isHTMLEqual;
const htmlparser2_1 = require("htmlparser2");
const ALLOWED_ATTRIBUTES = ["href", "src", "data-hash"];
function isHTMLEqual(one, two) {
    if (typeof one !== "string" || typeof two !== "string")
        return false;
    return toDiffable(one) === toDiffable(two);
}
function toDiffable(html) {
    let text = "";
    const parser = new htmlparser2_1.Parser({
        ontext: (data) => (text += data.trim()),
        onopentag: (_name, attr) => {
            for (const key of ALLOWED_ATTRIBUTES) {
                const value = attr[key];
                if (!value)
                    continue;
                text += value.trim();
            }
        }
    }, {
        lowerCaseTags: false
        // parseAttributes: true
    });
    parser.end(html);
    return text;
}
