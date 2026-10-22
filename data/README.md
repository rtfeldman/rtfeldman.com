# Compression benchmark data

The latest macOS optimization results are in
[`macos-optimization-2026-10-21`](macos-optimization-2026-10-21/report.txt).
Its raw CSV, summaries, provenance, source patch, and Git bundle describe the
same source revision. `investigation/` retains targeted comparisons and the
explanation of the earlier median regression; those exploratory comparisons
are separate from the complete latest run.

[`macos-optimization-initial-2026-10-21`](macos-optimization-initial-2026-10-21/report.txt)
preserves the first optimization's complete run at `2dbe9a2`, before this
follow-up investigation. It is historical data, retained for comparison.

[`report.txt`](report.txt), `comparison-summary.csv`,
`macos-aarch64-2026-10-21/`, and `x64-2026-10-21-final/` are the matched-version
reference comparison: both platforms use roc-deflate `16578ed` and Roc
`5e62c0e1`. The Linux data remain the revised final archive supplied by the
user. Linux has not been rerun with the subsequent macOS source optimizations;
these reference results must not be described as measurements of that source.

Regenerate the reference summaries with `node data/analyze-timings.mjs` and
the latest optimization summaries with `node data/analyze-macos-optimization.mjs`.
Each script validates all expected samples and the raw TSV/CSV agreement.

A gap is `(median Roc elapsed time / median libdeflate elapsed time - 1) * 100`
for one corpus file at one compression level. Headline maxima and aggregate
medians refer to those 144 case gaps, rather than individual outlier timings.
