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
exports.templateWithFrontmatter = exports.buildMarkdown = void 0;
const date_js_1 = require("../date.js");
const buildMarkdown = (data) => `# ${data.title}

${data.content}`;
exports.buildMarkdown = buildMarkdown;
const templateWithFrontmatter = (data) => `---
${buildFrontmatter(data)}
---

# ${data.title}

${data.content}`;
exports.templateWithFrontmatter = templateWithFrontmatter;
function buildFrontmatter(data) {
    const lines = [
        `title: ${JSON.stringify(data.title || "")}`,
        `created_at: ${(0, date_js_1.formatDate)(data.dateCreated)}`,
        `updated_at: ${(0, date_js_1.formatDate)(data.dateEdited)}`
    ];
    if (data.pinned)
        lines.push(`pinned: ${data.pinned}`);
    if (data.favorite)
        lines.push(`favorite: ${data.favorite}`);
    if (data.archived)
        lines.push(`archived: ${data.archived}`);
    if (data.color)
        lines.push(`color: ${data.color}`);
    if (data.tags)
        lines.push(`tags: ${data.tags.join(", ")}`);
    return lines.join("\n");
}
