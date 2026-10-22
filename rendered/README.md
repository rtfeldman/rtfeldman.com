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
regeneration is reproducible. All dot positions are precomputed percentages on a
shared linear 0–700 MB/s axis (the ceiling adjusts if future data requires it).

The inputs are the latest published measurements, not investigation runs:

- macOS: `data/macos-optimization-2026-10-22/roc-deflate-compression-timings.csv`.
  Calculate the median throughput of 15 repetitions for each file, engine,
  and level, using input bytes and elapsed nanoseconds for full precision.
- Linux: `data/x64-2026-10-22-final/compression-medians.csv`.
  The archive supplies per-file medians of 7 repetitions, rounded to 0.1 MB/s,
  without individual runs.

Both charts show the same statistic: per-file median throughputs.
Hover text states each machine’s repetition count and identifies the values as
per-file medians. The visible callouts use “fastest run” and “slowest run”.

There are 12 levels and 12 corpus files. Each engine has 12 dots per level,
with each dot centered at `median / axis ceiling`. Dots share an x position
within each engine's column; close values overlap. Slightly translucent fills
help show clusters, but not every overlapping dot can be distinguished by eye.

CSS-only machine tabs switch between M1 MacBook Pro and Ryzen 3900X Ubuntu,
using the same scale. Gray represents libdeflate on the left; purple
represents roc-deflate on the right. Hovering or focusing a dot reveals its
details in the empty graph area beside the legend (below it on narrow screens).
The readout stays visible while hovered, with a brief delay when leaving a dot
to allow the pointer to travel to it. Switching dots replaces the readout.

Each dot has a concise accessible name and `aria-describedby` pointing to a
`role="tooltip"` element whose accessible name contains the complete data
description, including the machine, speed, file, and repetition count.
Visible formatting is hidden from assistive technology to avoid repeating it.
There are no native `title` tooltips. The readouts do not cover meaningful chart
content, so the WCAG 1.4.13 exception for non-obscuring content applies to
dismissal; no Escape handler or JavaScript is required. Keyboard focus and
mouse hover both reveal the same data. The article contains no JavaScript.

Preview the whole rendered site, including shared CSS, fonts and assets:

```sh
perl serve-site.pl 8080
```

Open <http://localhost:8080/fp-vs-c.html>. The server
binds only to loopback and reads the files directly, so refreshing shows edits.
The existing deployment build also copies this HTML from `rendered/`.
