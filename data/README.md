# Compression benchmark data

The current macOS results are in
[`macos-optimization-2026-10-22/report.txt`](macos-optimization-2026-10-22/report.txt).
The top-level [`report.txt`](report.txt) is an identical copy.
That directory contains the full raw CSV, summaries, source provenance,
validation logs, and the paired before/after comparison. Recompute them with
`node data/analyze-embedded-benchmarks.mjs`.

The current Linux x64 data remain the revised archive supplied by the user,
[`x64-2026-10-21-final/`](x64-2026-10-21-final/).
[`current-comparison-summary.csv`](current-comparison-summary.csv) lists both
current datasets with their compiler and library commits;
[`comparison-summary.csv`](comparison-summary.csv) is an identical copy. Linux has not been
rerun with the subsequent macOS changes. The current platforms and source
versions differ; this is not a controlled comparison of CPU architectures.

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

- [`macos-optimization-2026-10-21/`](macos-optimization-2026-10-21/report.txt)
  and [`macos-optimization-initial-2026-10-21/`](macos-optimization-initial-2026-10-21/report.txt)
  use the earlier basic-cli/preload procedure. Recompute their summaries with
  `node data/analyze-macos-optimization.mjs`.
- [`reference-report.txt`](reference-report.txt), `reference-comparison-summary.csv`, and
  [`macos-aarch64-2026-10-21/`](macos-aarch64-2026-10-21/) preserve the original
  matched-version comparison against the supplied Linux archive. Both use
  roc-deflate `16578ed` and Roc `5e62c0e1`. Recompute those reference summaries
  with `node data/analyze-timings.mjs`.

A gap is `(median Roc elapsed time / median libdeflate elapsed time - 1) * 100`
for one corpus file at one compression level. Headline maxima and aggregate
medians refer to those 144 case gaps, rather than individual outlier timings.
All analyzers validate expected samples and agreement between raw TSV and CSV.
No blog post or charts are rendered by these scripts.
