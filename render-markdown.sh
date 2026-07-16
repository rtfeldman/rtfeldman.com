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

node "$(dirname "$0")/render-markdown.mjs" "$input" "$output"
