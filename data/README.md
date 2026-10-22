# Compression benchmark data

The current macOS and Linux report is in
[`macos-optimization-2026-10-22/report.txt`](macos-optimization-2026-10-22/report.txt).
The top-level [`report.txt`](report.txt) is an identical copy.
That directory contains the full raw CSV, summaries, source provenance,
validation logs, and the paired before/after comparison. Recompute them with
`node data/analyze-embedded-benchmarks.mjs`.

The current Linux x64 data are the final archive supplied by the user,
[`x64-2026-10-22-final/`](x64-2026-10-22-final/), imported from
`~/Downloads/deflate-final.tzr.gz` (the requested name was `deflate-final.tar.gz`).
All seven supplied files are retained verbatim with SHA-256 hashes in
`archive-provenance.json`. Recompute Linux summaries alone with
`node data/analyze-linux-final.mjs`, or both current datasets with
`node data/analyze-embedded-benchmarks.mjs`.

[`current-comparison-summary.csv`](current-comparison-summary.csv) lists both
current datasets with their compiler and library commits;
[`comparison-summary.csv`](comparison-summary.csv) is an identical copy.
[`current-per-file-summary.csv`](current-per-file-summary.csv) contains all 288
current platform/file/level cases for subsequent use in the blog post.
Both datasets use Roc compiler `d99c7b838f`, but Linux uses roc-deflate `04cb55f`
and macOS uses `6710774`. Their harnesses and sampling protocols differ;
this is not a controlled comparison of CPU architectures.

The Linux archive contains **rounded case medians, not raw repetitions**.
`compression-medians.csv` contains 288 engine/case medians (reported as seven
repetitions each); `per-file-summary.csv` contains the 144 comparisons. No raw
timing CSV or individual measurements are fabricated. Linux summaries calculate
gaps from MB/s rounded to 0.1; rounding bounds are included separately from
the estimates. Raw-sample variability and byte-identity checks cannot be
independently recomputed from this archive. The README reports output identity
and retains the check script, but no execution log or compressed outputs.
Linux pins each engine to core 6 using `scripts/abp.sh`; the unpinned reproduction
script is not the exact measurement procedure. The README also flags bimodal
L1 dickens results from other passes not included in the supplied medians.

The new macOS series uses embedded inputs, the minimal C echo/clock platform,
and static mimalloc for both engines. Every file/level case runs in a fresh
process. Both engines warm their reusable output buffer for at least 200 ms
before timing. The C engine and two Roc versions rotate execution positions
across three rounds, with five timed repetitions per case per round. Every
compressed output is checked against libdeflate's exact bytes.

[`macos-before-2026-10-22/`](macos-before-2026-10-22/) rebuilds the earlier library
and compiler with this same final platform and procedure. It shares exactly
the same C samples with the current macOS dataset. This paired run is the
controlled before/after comparison. The final dataset's `investigation/`
directory retains screening experiments separately from the complete run.

Earlier datasets remain historical records:

- [`x64-2026-10-21-final/`](x64-2026-10-21-final/) is superseded by the October 22
  Linux archive. It remains only for historical reports and the original
  matched-version comparison; no current summary uses its measurements.
- [`macos-optimization-2026-10-21/`](macos-optimization-2026-10-21/report.txt)
  and [`macos-optimization-initial-2026-10-21/`](macos-optimization-initial-2026-10-21/report.txt)
  use the earlier basic-cli/preload procedure. Recompute their summaries with
  `node data/analyze-macos-optimization.mjs`.
- [`reference-report.txt`](reference-report.txt), `reference-comparison-summary.csv`, and
  [`macos-aarch64-2026-10-21/`](macos-aarch64-2026-10-21/) preserve the original
  matched-version comparison against the October 21 Linux archive. Both use
  roc-deflate `16578ed` and Roc `5e62c0e1`. Recompute those reference summaries
  with `node data/analyze-timings.mjs`.

A gap is `(median Roc elapsed time / median libdeflate elapsed time - 1) * 100`
for one corpus file at one compression level. Headline maxima and aggregate
medians refer to those 144 case gaps, rather than individual outlier timings.
Raw-data analyzers validate expected samples and agreement between raw TSV and CSV.
The Linux final analyzer instead validates all expected median cases, source
hashes, and agreement with the supplied rounded gaps. A negative gap means
less elapsed time; it is not the percentage increase in throughput.
No blog post or charts are rendered by these scripts.
