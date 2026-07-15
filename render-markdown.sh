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

tmp_body=$(mktemp)
tmp_output=$(mktemp)
cleanup() {
    rm -f "$tmp_body" "$tmp_output"
}
trap cleanup EXIT

npx --yes marked@18.0.6 "$input" > "$tmp_body"

node - "$input" "$tmp_body" "$tmp_output" <<'NODE'
const fs = require("fs");

const [inputPath, bodyPath, outputPath] = process.argv.slice(2);
const markdown = fs.readFileSync(inputPath, "utf8");

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
