# Editing the compression post

`fp-vs-c.html` is now the editable source of truth for
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
  does not contain individual samples; the hover titles identify case medians.

There are 12 levels and 12 corpus files. Each machine's range floats from
`minimum / axis ceiling` to `maximum / axis ceiling`, with height
`(maximum - minimum) / axis ceiling`. The corpus files providing those endpoints
need not be the same. Bar length shows the spread; the top's position shows the
fastest speed.

Both machines appear together with exactly aligned bars: M1 uses a 65% opaque
fill and Ryzen uses a 35% opaque fill of the same library color. Overlapping
intervals combine to 77.25% opacity; a range belonging to only one machine uses
that machine's opacity. The dark theme uses brighter base colors for contrast.
Native `title` tooltips include both machines so a contained range's values
remain available on hover. Accessible bar labels identify each machine,
endpoints, corpus names, and sampling method. libdeflate
is on the left and roc-deflate is on the right at each level. The article contains
no JavaScript.

Preview the whole rendered site, including shared CSS, fonts and assets:

```sh
perl serve-site.pl 8080
```

Open <http://localhost:8080/fp-vs-c.html>. The server
binds only to loopback and reads the files directly, so refreshing shows edits.
The existing deployment build also copies this HTML from `rendered/`.
