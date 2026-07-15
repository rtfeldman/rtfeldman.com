#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
    echo "Usage: $0 <markdown-file> [output-html]" >&2
    exit 64
fi

input=$1

if [[ ! -f "$input" ]]; then
    echo "Markdown file not found: $input" >&2
    exit 66
fi

basename=$(basename "$input" .md)
output=${2:-"rendered/${basename}.html"}
output_dir=$(dirname "$output")

mkdir -p "$output_dir"

tmp_markdown=$(mktemp)
tmp_scripts=$(mktemp)
tmp_body=$(mktemp)
tmp_output=$(mktemp)
cleanup() {
    rm -f "$tmp_markdown" "$tmp_scripts" "$tmp_body" "$tmp_output"
}
trap cleanup EXIT

node - "$input" "$tmp_markdown" "$tmp_scripts" <<'NODE'
const fs = require("fs");

const [inputPath, markdownPath, scriptsPath] = process.argv.slice(2);
let markdown = fs.readFileSync(inputPath, "utf8");
const scripts = [];

markdown = markdown.replace(/<script\b[\s\S]*?<\/script>/gi, (script) => {
    const index = scripts.push(script) - 1;
    return `\n\n@@RAW_SCRIPT_${index}@@\n\n`;
});

fs.writeFileSync(markdownPath, markdown);
fs.writeFileSync(scriptsPath, JSON.stringify(scripts));
NODE

npx --yes marked@18.0.6 "$tmp_markdown" > "$tmp_body"

node - "$input" "$tmp_scripts" "$tmp_body" "$tmp_output" <<'NODE'
const fs = require("fs");

const [inputPath, scriptsPath, bodyPath, outputPath] = process.argv.slice(2);
const markdown = fs.readFileSync(inputPath, "utf8");
const scripts = JSON.parse(fs.readFileSync(scriptsPath, "utf8"));

const titleMatch = markdown.match(/^#\s+(.+)$/m);
const title = (titleMatch ? titleMatch[1] : "rtfeldman.com")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");

let body = fs.readFileSync(bodyPath, "utf8")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<\/pre><p/g, "</pre>\n<p");

for (const [index, script] of scripts.entries()) {
    const placeholder = `@@RAW_SCRIPT_${index}@@`;
    body = body
        .replace(`<p>${placeholder}</p>`, script)
        .replace(placeholder, script);
}

const html = `<!doctype html>
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
`;

fs.writeFileSync(outputPath, html);
NODE

mv "$tmp_output" "$output"
echo "Rendered $input -> $output"
