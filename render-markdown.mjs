import fs from "node:fs";
import path from "node:path";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
    console.error("Usage: render-markdown.mjs <markdown-file> <output-html>");
    process.exit(64);
}

const markdown = fs.readFileSync(inputPath, "utf8");
const title = cleanTitle(markdown.match(/^#\s+(.+)$/m)?.[1] ?? "rtfeldman.com");
const body = addHeadingLinks(renderMarkdown(markdown));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `<!doctype html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <link rel="stylesheet" href="site.css" />
    </head>
    <body>
        <main>
${body.trimEnd()}
        </main>
    </body>
</html>
`);

console.log(`Rendered ${inputPath} -> ${outputPath}`);

function renderMarkdown(source) {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const html = [];

    for (let i = 0; i < lines.length;) {
        const line = lines[i];

        if (line.trim() === "") {
            i += 1;
            continue;
        }

        const raw = readRawHtmlBlock(lines, i);
        if (raw) {
            html.push(raw.html);
            i = raw.next;
            continue;
        }

        const fence = line.match(/^```([A-Za-z0-9_-]*)\s*$/);
        if (fence) {
            const code = [];
            i += 1;
            while (i < lines.length && !/^```\s*$/.test(lines[i])) {
                code.push(lines[i]);
                i += 1;
            }
            if (i === lines.length) {
                throw new Error(`Unclosed code fence in ${inputPath}`);
            }
            i += 1;
            html.push(`<pre><code>${escapeHtml(code.join("\n"))}\n</code></pre>`);
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
        if (heading) {
            html.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
            i += 1;
            continue;
        }

        if (isTableStart(lines, i)) {
            const table = readTable(lines, i);
            html.push(renderTable(table.rows, table.alignments));
            i = table.next;
            continue;
        }

        if (/^>\s?/.test(line)) {
            const quote = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                quote.push(lines[i].replace(/^>\s?/, ""));
                i += 1;
            }
            html.push(`<blockquote>\n<p>${renderInline(quote.join(" "))}</p>\n</blockquote>`);
            continue;
        }

        if (/^\s*[-*]\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*]\s+/, "").replace(/\s+$/, ""));
                i += 1;
            }
            html.push(`<ul>\n${items.map((item) => `<li>${renderInline(item)}</li>`).join("\n")}\n</ul>`);
            continue;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*\d+\.\s+/, "").replace(/\s+$/, ""));
                i += 1;
            }
            html.push(`<ol>\n${items.map((item) => `<li>${renderInline(item)}</li>`).join("\n")}\n</ol>`);
            continue;
        }

        const paragraph = [];
        while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines, i)) {
            paragraph.push(lines[i].trim());
            i += 1;
        }
        html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    }

    return html.join("\n");
}

function startsBlock(lines, index) {
    const line = lines[index];
    return Boolean(
        readRawHtmlBlock(lines, index)
            || /^```/.test(line)
            || /^(#{1,6})\s+/.test(line)
            || isTableStart(lines, index)
            || /^>\s?/.test(line)
            || /^\s*[-*]\s+/.test(line)
            || /^\s*\d+\.\s+/.test(line),
    );
}

function readRawHtmlBlock(lines, index) {
    const line = lines[index];
    const trimmed = line.trim();
    const blockTag = trimmed.match(/^<(aside|blockquote|div|h[1-6]|pre|script|table|video)\b/i)?.[1]?.toLowerCase();

    if (/^<hr\b/i.test(trimmed)) {
        return { html: line, next: index + 1 };
    }

    if (!blockTag) {
        return null;
    }

    if (/^h[1-6]$/.test(blockTag)) {
        return { html: line, next: index + 1 };
    }

    const endTag = new RegExp(`</${escapeRegExp(blockTag)}>`, "i");
    const startTag = new RegExp(`<${escapeRegExp(blockTag)}\\b`, "gi");
    let depth = 0;
    const block = [];

    for (let i = index; i < lines.length; i += 1) {
        const current = lines[i];
        depth += current.match(startTag)?.length ?? 0;
        if (endTag.test(current)) {
            depth -= current.match(new RegExp(`</${escapeRegExp(blockTag)}>`, "gi"))?.length ?? 0;
        }
        block.push(current);

        if (depth <= 0) {
            return { html: block.join("\n"), next: i + 1 };
        }
    }

    throw new Error(`Unclosed <${blockTag}> block in ${inputPath}`);
}

function isTableStart(lines, index) {
    return Boolean(lines[index + 1]
        && /^\s*\|/.test(lines[index])
        && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]));
}

function readTable(lines, index) {
    const headers = splitTableRow(lines[index]);
    const alignments = splitTableRow(lines[index + 1]).map((cell) => {
        const trimmed = cell.trim();
        if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
        if (trimmed.endsWith(":")) return "right";
        return "left";
    });
    const rows = [headers];
    let i = index + 2;

    while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
    }

    return { rows, alignments, next: i };
}

function splitTableRow(row) {
    const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells = [];
    let cell = "";
    let escaped = false;
    let code = false;

    for (const char of trimmed) {
        if (escaped) {
            cell += char;
            escaped = false;
        } else if (char === "\\") {
            cell += char;
            escaped = true;
        } else if (char === "`") {
            code = !code;
            cell += char;
        } else if (char === "|" && !code) {
            cells.push(cell.trim());
            cell = "";
        } else {
            cell += char;
        }
    }

    cells.push(cell.trim());
    return cells;
}

function renderTable(rows, alignments) {
    const align = (index) => alignments[index] ? ` align="${alignments[index]}"` : "";
    const headers = rows[0].map((cell, index) => `<th${align(index)}>${renderInline(cell)}</th>`).join("\n");
    const bodyRows = rows.slice(1).map((row) => {
        const cells = row.map((cell, index) => `<td${align(index)}>${renderInline(cell)}</td>`).join("\n");
        return `<tr>\n${cells}\n</tr>`;
    }).join("\n");

    return `<table>
<thead>
<tr>
${headers}
</tr>
</thead>
<tbody>${bodyRows}</tbody></table>`;
}

function renderInline(input) {
    const placeholders = [];
    const hold = (html) => {
        const placeholder = `\u0000${placeholders.length}\u0000`;
        placeholders.push(html);
        return placeholder;
    };

    let text = renderLinks(input, hold);
    text = text.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escapeHtml(unescapeMarkdown(code))}</code>`));
    text = escapeHtml(unescapeMarkdown(text));
    text = text
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s([{])\*([^*\n]+)\*(?=$|[\s.,;:!?()[\]{}])/g, "$1<em>$2</em>")
        .replace(/(^|[\s([{])_([^_\n]+)_(?=$|[\s.,;:!?()[\]{}])/g, "$1<em>$2</em>");

    return text.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)]);
}

function renderLinks(text, hold) {
    let output = "";

    for (let i = 0; i < text.length;) {
        if (text[i] !== "[") {
            output += text[i];
            i += 1;
            continue;
        }

        const close = findMatchingBracket(text, i);
        if (close === -1 || text[close + 1] !== "(") {
            output += text[i];
            i += 1;
            continue;
        }

        const destination = readLinkDestination(text, close + 2);
        if (!destination) {
            output += text[i];
            i += 1;
            continue;
        }

        const label = text.slice(i + 1, close);
        const href = destination.href.replace(/^<|>$/g, "");
        output += hold(`<a href="${escapeAttribute(unescapeMarkdown(href))}">${renderInline(label)}</a>`);
        i = destination.next;
    }

    return output;
}

function findMatchingBracket(text, open) {
    let escaped = false;
    for (let i = open + 1; i < text.length; i += 1) {
        if (escaped) {
            escaped = false;
        } else if (text[i] === "\\") {
            escaped = true;
        } else if (text[i] === "]") {
            return i;
        }
    }
    return -1;
}

function readLinkDestination(text, start) {
    let escaped = false;
    let depth = 1;
    let href = "";

    for (let i = start; i < text.length; i += 1) {
        const char = text[i];
        if (escaped) {
            href += `\\${char}`;
            escaped = false;
        } else if (char === "\\") {
            escaped = true;
        } else if (char === "(") {
            depth += 1;
            href += char;
        } else if (char === ")") {
            depth -= 1;
            if (depth === 0) {
                return { href, next: i + 1 };
            }
            href += char;
        } else {
            href += char;
        }
    }

    return null;
}

function addHeadingLinks(body) {
    const headingIds = new Map();

    return body.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level, headingHtml) => {
        const id = slugify(headingHtml, headingIds);
        return `<h${level} id="${id}"><a class="heading-link" href="#${id}">${headingHtml}</a></h${level}>`;
    });
}

function slugify(headingHtml, headingIds) {
    const text = decodeHtml(headingHtml.replace(/<[^>]*>/g, ""));
    const base = text
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "heading";
    const count = headingIds.get(base) || 0;
    headingIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
}

function cleanTitle(value) {
    return escapeHtml(decodeHtml(value)
        .replace(/<[^>]*>/g, "")
    );
}

function unescapeMarkdown(value) {
    return value.replace(/\\([\\`*_[\](){}#+\-.!|>])/g, "$1");
}

function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
    return escapeHtml(value)
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function decodeHtml(value) {
    return value
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'");
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
