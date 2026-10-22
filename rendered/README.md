# Editing the compression post

`how-close-can-pure-fp-get-to-c.html` is now the editable source of truth for
the article. The Markdown is a snapshot of the text before rendering. Edit
the HTML directly; do not render the Markdown over subsequent HTML edits.

Regenerate only the chart and its inline `<style>` block with:

```sh
perl data/embed-compression-chart.pl
```

Run this from the repository root. The script uses only core Perl modules,
validates complete input coverage, and replaces only the two marked blocks.
It does not change the article prose. Chart CSS lives in the script so that
regeneration is reproducible. All heights are precomputed percentages on a
shared linear 0–700 MB/s axis (the ceiling adjusts if future data requires it).

The inputs are the latest published measurements, not investigation runs:

- macOS: `data/macos-optimization-2026-10-22/roc-deflate-compression-timings.csv`.
  Minimum and maximum of all individual samples per engine and level:
  12 files × 15 repetitions = 180 observations per bar.
- Linux: `data/x64-2026-10-22-final/compression-medians.csv`.
  Minimum and maximum of the 12 file medians per engine and level. The archive
  does not contain individual samples; the chart explicitly labels this.

There are 12 levels and 12 corpus files. For each engine/level, the entire bar
has height `maximum / axis ceiling`; the light bottom occupies `minimum / maximum`
of that bar, and the dark top occupies `(maximum - minimum) / maximum`.
Consequently the boundary is at the minimum and the top is at the maximum.
The corpus files providing those endpoints need not be the same.

The machine controls use native radios and CSS. Native `title` tooltips give
the endpoints and corpus names; native `<details>` provides exact values for
touch and keyboard users. The article contains no JavaScript.

Preview the whole rendered site, including shared CSS, fonts and assets:

```sh
perl serve-site.pl 8080
```

Open <http://localhost:8080/how-close-can-pure-fp-get-to-c.html>. The server
binds only to loopback and reads the files directly, so refreshing shows edits.
The existing deployment build also copies this HTML from `rendered/`.
