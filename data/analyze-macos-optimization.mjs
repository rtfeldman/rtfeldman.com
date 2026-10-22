import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './analyze-timings.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const directory = 'macos-optimization-2026-10-21';
const provenance = JSON.parse(fs.readFileSync(path.join(root, directory, 'provenance.json'), 'utf8'));
const revision = provenance.sources['roc-deflate'];
const before = analyze('macos-aarch64-2026-10-21', 'Apple M1 Pro / macOS aarch64 / reference');
const after = analyze(directory, 'Apple M1 Pro / macOS aarch64 / optimized roc-deflate');
const byCase = new Map(before.cases.map(c => [`${c.level}|${c.corpus}`, c]));
const comparison = after.cases.map(c => {
  const old = byCase.get(`${c.level}|${c.corpus}`);
  assert.equal(c.input_bytes, old.input_bytes);
  assert.equal(c.compressed_bytes, old.compressed_bytes);
  return {
    level: c.level,
    corpus: c.corpus,
    reference_gap_percent: old.roc_extra_time_percent,
    optimized_gap_percent: c.roc_extra_time_percent,
    gap_change_percentage_points: c.roc_extra_time_percent - old.roc_extra_time_percent,
    roc_time_change_percent: (c.roc_median_ns / old.roc_median_ns - 1) * 100,
    c_time_change_percent: (c.c_median_ns / old.c_median_ns - 1) * 100,
    reference_c_median_ns: old.c_median_ns,
    reference_roc_median_ns: old.roc_median_ns,
    optimized_c_median_ns: c.c_median_ns,
    optimized_roc_median_ns: c.roc_median_ns,
  };
});
const columns = Object.keys(comparison[0]);
fs.writeFileSync(path.join(root, directory, 'before-after.csv'), [columns.join(','), ...comparison.map(r => columns.map(k => r[k]).join(','))].join('\n') + '\n');
const pct = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const ranked = [...comparison].sort((a,b) => b.optimized_gap_percent - a.optimized_gap_percent);
const s = after.summary;
const report = [
  'macOS compression optimization — Apple M1 Pro, 2026-10-21',
  '',
  'Reference roc-deflate: 16578ed0f16f83a1eb7491568c983446f622fd4a.',
  `Optimized roc-deflate: ${revision}, local branch macos-deflate-gap.`,
  'Both use Roc 5e62c0e13ae779c28f7904dcdd2849ba13240beb, libdeflate b122c8b,',
  'mimalloc v2.1.7, Zig 0.17.0, and the same Silesia corpus and timing procedure.',
  'The compiler binary was reused exactly; no compiler source changes were made.',
  'This is a new complete Mac run, separate from the matched-version Linux/Mac reference data.',
  '',
  'MEASUREMENT',
  'Gap = (median Roc elapsed ns / median C elapsed ns - 1) * 100 for each file/level.',
  'Positive means Roc takes more time; negative means Roc takes less time.',
  'Every case has 15 samples per engine at levels 1–9 and 6 at levels 10–12.',
  'Maximum refers to the largest per-case median gap, not to individual repetition outliers.',
  'C runs before Roc within each round, following the original procedure.',
  'Both reuse output buffers; C also reuses its compressor, while Roc allocates internal work structures.',
  'One full before run and one full after run, on an active desktop. Fixed run order,',
  'system load, frequency changes, and normal noise limit precision. No confidence interval is claimed.',
  '',
  'RESULTS',
  `Reference maximum gap: ${pct(before.summary.max_roc_extra_time_percent)} (${before.summary.max_case}).`,
  `Optimized maximum gap: ${pct(s.max_roc_extra_time_percent)} (${s.max_case}).`,
  `Conservative whole-percent upper bound for this run: ${Math.ceil(s.max_roc_extra_time_percent)}% extra time.`,
  `Conservative one-decimal upper bound: ${(Math.ceil(s.max_roc_extra_time_percent * 10) / 10).toFixed(1)}%.`,
  `Reference median gap: ${pct(before.summary.median_roc_extra_time_percent)}.`,
  `Optimized median gap: ${pct(s.median_roc_extra_time_percent)}.`,
  `Optimized geometric mean gap: ${pct(s.geometric_mean_roc_extra_time_percent)}.`,
  `Optimized best gap: ${pct(s.min_roc_extra_time_percent)} (${s.min_case}).`,
  `Roc wins ${s.roc_faster_cases} / ${s.cases} cases, versus ${before.summary.roc_faster_cases} before.`,
  `Cases within +/-10%: ${s.cases_within_10_percent}; +/-15%: ${s.cases_within_15_percent}; +/-20%: ${s.cases_within_20_percent}.`,
  `Whole workload, summing per-case median times: C ${(s.c_sum_median_ns/1e9).toFixed(2)} s, Roc ${(s.roc_sum_median_ns/1e9).toFixed(2)} s, gap ${pct(s.total_roc_extra_time_percent)}.`,
  `Median within-case timing IQR/median: C ${s.c_median_case_iqr_percent.toFixed(2)}%, Roc ${s.roc_median_case_iqr_percent.toFixed(2)}%.`,
  '',
  'TWELVE LARGEST REMAINING GAPS: level | file | before | after',
  ...ranked.slice(0,12).map(r => `${r.level} | ${r.corpus} | ${pct(r.reference_gap_percent)} | ${pct(r.optimized_gap_percent)}`),
  '',
  'ORIGINAL TWELVE WORST CASES: level | file | before | after',
  ...[...comparison].sort((a,b) => b.reference_gap_percent - a.reference_gap_percent).slice(0,12).map(r => `${r.level} | ${r.corpus} | ${pct(r.reference_gap_percent)} | ${pct(r.optimized_gap_percent)}`),
  '',
  'CHANGES',
  'The greedy parser places the frequently accessed length-4 heads at offset zero.',
  'This removes region-offset address calculations in the insertion loop; all chain indices',
  'now explicitly include the chain region base. Compression search parameters are unchanged.',
  'The lazy parser retains its original chain-first layout, since its deeper searches benefit',
  'from cheap chain traversal. The general insertion helper takes the selected table layout.',
  'Level 1 installs the last two hash-bucket positions of an offset-one run directly, then',
  'inserts the three four-byte sequences crossing the run end normally. Earlier updates',
  'to that bucket cannot survive because it retains only two positions. Window-crossing',
  'runs and input-end cases still use the existing general insertion routine.',
  '',
  'VALIDATION',
  '17 unit tests passed with --opt=speed. Expanded integration tests passed: gzip interop,',
  '410 edge inputs at each of 13 levels, libdeflate byte identity at levels 1–12,',
  'round trips, compress_bound checks, truncation/bit-flip checks, and compression-ratio gates.',
  'The expanded cases include 32767/32768/32769-byte window boundaries and two-byte repeats.',
  'The new full timing run has all 3,672 expected unique samples; its CSV and raw TSV agree.',
  'All 396 round-pair output comparisons passed, and all corresponding input and compressed',
  'sizes agree with the reference run. Output mismatch log is empty.',
  '',
  'REPRODUCING',
  'roc-deflate.patch contains the complete source change. roc-deflate.bundle retains the',
  'exact local commit, with 16578ed as its prerequisite. In a clone containing that base:',
  '  git fetch /absolute/path/to/roc-deflate.bundle macos-deflate-gap',
  '  git checkout --detach FETCH_HEAD',
  'Then run the retained procedure with ROC_DEFLATE_REPO set to that clone and',
  `ROC_DEFLATE_REF=${revision}. Keep -j2 on Zig builds.`,
  'Regenerate this analysis from the blog repository with node data/analyze-macos-optimization.mjs.',
];
fs.writeFileSync(path.join(root, directory, 'report.txt'), report.join('\n') + '\n');
console.log(JSON.stringify(s, null, 2));
console.log(ranked.slice(0,12));
