import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './analyze-timings.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const directory = 'macos-optimization-2026-10-21';
const provenance = JSON.parse(fs.readFileSync(path.join(root, directory, 'provenance.json'), 'utf8'));
const revision = provenance.sources['roc-deflate'];
const before = analyze('macos-aarch64-2026-10-21', 'Apple M1 Pro / macOS aarch64');
const initial = analyze('macos-optimization-initial-2026-10-21', 'Apple M1 Pro / macOS aarch64 / first optimization');
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
const initialByCase = new Map(initial.cases.map(c => [`${c.level}|${c.corpus}`, c]));
const followup = after.cases.map(c => {
  const old = initialByCase.get(`${c.level}|${c.corpus}`);
  assert.equal(c.input_bytes, old.input_bytes);
  assert.equal(c.compressed_bytes, old.compressed_bytes);
  return {
    level: c.level, corpus: c.corpus,
    initial_gap_percent: old.roc_extra_time_percent,
    latest_gap_percent: c.roc_extra_time_percent,
    gap_change_percentage_points: c.roc_extra_time_percent - old.roc_extra_time_percent,
    roc_time_change_percent: (c.roc_median_ns / old.roc_median_ns - 1) * 100,
    c_time_change_percent: (c.c_median_ns / old.c_median_ns - 1) * 100,
  };
});
const followupColumns = Object.keys(followup[0]);
fs.writeFileSync(path.join(root, directory, 'before-after-initial.csv'), [followupColumns.join(','), ...followup.map(r => followupColumns.map(k => r[k]).join(','))].join('\n') + '\n');
const pct = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};
const ranked = [...comparison].sort((a,b) => b.optimized_gap_percent - a.optimized_gap_percent);
const s = after.summary;
const report = [
  'macOS compression optimization — Apple M1 Pro, 2026-10-21',
  '',
  'Reference roc-deflate: 16578ed0f16f83a1eb7491568c983446f622fd4a.',
  `Optimized roc-deflate: ${revision}, branch macos-deflate-gap.`,
  `Source: https://github.com/rtfeldman/roc-deflate/tree/${revision}`,
  'Both use Roc 5e62c0e13ae779c28f7904dcdd2849ba13240beb, libdeflate b122c8b,',
  'mimalloc v2.1.7, Zig 0.17.0, and the same Silesia corpus and timing procedure.',
  'The compiler binary was reused exactly; no compiler source changes were made.',
  'The first optimization is retained separately in macos-optimization-initial-2026-10-21.',
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
  `First optimization maximum gap: ${pct(initial.summary.max_roc_extra_time_percent)} (${initial.summary.max_case}).`,
  `Conservative whole-percent upper bound for this run: ${Math.ceil(s.max_roc_extra_time_percent)}% extra time.`,
  `Conservative one-decimal upper bound: ${(Math.ceil(s.max_roc_extra_time_percent * 10) / 10).toFixed(1)}%.`,
  `Reference median gap: ${pct(before.summary.median_roc_extra_time_percent)}.`,
  `Optimized median gap: ${pct(s.median_roc_extra_time_percent)}.`,
  `First optimization median gap: ${pct(initial.summary.median_roc_extra_time_percent)}.`,
  `Reference / first optimization / latest mean gaps: ${pct(before.summary.mean_roc_extra_time_percent)} / ${pct(initial.summary.mean_roc_extra_time_percent)} / ${pct(s.mean_roc_extra_time_percent)}.`,
  `Optimized geometric mean gap: ${pct(s.geometric_mean_roc_extra_time_percent)}.`,
  `Gap percentiles: p10 ${pct(s.p10_roc_extra_time_percent)}; p25 ${pct(s.p25_roc_extra_time_percent)}; p75 ${pct(s.p75_roc_extra_time_percent)}; p90 ${pct(s.p90_roc_extra_time_percent)}.`,
  `Optimized best gap: ${pct(s.min_roc_extra_time_percent)} (${s.min_case}).`,
  `Roc wins ${s.roc_faster_cases} / ${s.cases} cases, versus ${before.summary.roc_faster_cases} before.`,
  `Cases within +/-10%: ${s.cases_within_10_percent}; +/-15%: ${s.cases_within_15_percent}; +/-20%: ${s.cases_within_20_percent}.`,
  `Cases taking no more than 5% / 10% / 15% extra time (including all Roc wins): ${[5,10,15].map(limit => after.cases.filter(c => c.roc_extra_time_percent <= limit).length).join(' / ')} of 144.`,
  `Whole workload, summing per-case median times: C ${(s.c_sum_median_ns/1e9).toFixed(2)} s, Roc ${(s.roc_sum_median_ns/1e9).toFixed(2)} s, gap ${pct(s.total_roc_extra_time_percent)}.`,
  `Median within-case timing IQR/median: C ${s.c_median_case_iqr_percent.toFixed(2)}%, Roc ${s.roc_median_case_iqr_percent.toFixed(2)}%.`,
  `Cases with a smaller gap than the first optimization: ${followup.filter(r => r.gap_change_percentage_points < 0).length} / 144.`,
  `Median paired absolute Roc time change versus the first optimization: ${pct(median(followup.map(r => r.roc_time_change_percent)))}.`,
  `Median paired absolute C time change versus the first optimization: ${pct(median(followup.map(r => r.c_time_change_percent)))}.`,
  '',
  'PER-LEVEL MEDIAN GAPS: level | reference | first optimization | latest',
  ...Array.from({length: 12}, (_, i) => {
    const level = i + 1;
    const value = run => median(run.cases.filter(c => c.level === level).map(c => c.roc_extra_time_percent));
    return `${level} | ${pct(value(before))} | ${pct(value(initial))} | ${pct(value(after))}`;
  }),
  '',
  'TWELVE LARGEST REMAINING GAPS: level | file | before | after',
  ...ranked.slice(0,12).map(r => `${r.level} | ${r.corpus} | ${pct(r.reference_gap_percent)} | ${pct(r.optimized_gap_percent)}`),
  '',
  'ORIGINAL TWELVE WORST CASES: level | file | before | after',
  ...[...comparison].sort((a,b) => b.reference_gap_percent - a.reference_gap_percent).slice(0,12).map(r => `${r.level} | ${r.corpus} | ${pct(r.reference_gap_percent)} | ${pct(r.optimized_gap_percent)}`),
  '',
  'TWELVE BEST ROC CASES: level | file | reference | latest',
  ...[...comparison].sort((a,b) => a.optimized_gap_percent - b.optimized_gap_percent).slice(0,12).map(r => `${r.level} | ${r.corpus} | ${pct(r.reference_gap_percent)} | ${pct(r.optimized_gap_percent)}`),
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
  'The greedy parser now also recognizes offset-one matches. It preserves every chain',
  'link, filling consecutive positions directly, but publishes the identical hash heads',
  'once per run and avoids rehashing the same four bytes. The last three prefixes still',
  'take the ordinary insertion path. No search parameters or corpus-specific choices change.',
  'Fixed Huffman lengths and words are constructed directly from their prescribed values,',
  'avoiding a general Huffman tree build and its temporary allocations for each stream.',
  '',
  'MEDIAN REGRESSION INVESTIGATION',
  'The original rise from 5.64% to 6.76% was real: several middle-ranked cases slowed',
  'slightly while the largest gains were concentrated in the upper tail.',
  'In interleaved ablations, applying only the level-1 source change also slowed some',
  'lazy levels, where that path is never executed. Assembly combines multiple parser',
  'paths in one large function; changes alter register allocation and stack layout.',
  'The shared insertion helper is inlined, so an extra runtime call argument was not',
  'the simple explanation. Fixed-offset helper copies did not consistently recover speed.',
  'These results establish cross-path generated-code sensitivity, not a complete causal',
  'attribution of every percentage point to a particular CPU stall. See investigation/.',
  'A same-directory, no-cache rebuild check reproduces this effect. Two unchanged reference',
  'builds have identical machine code; changing only level 1 slows reymont L7 by 0.42%,',
  'dickens L6 by 1.26%, and mozilla L5 by 0.87% relative to the clean reference build.',
  'SIMD hash batching, extra search bounds, and alternative scanner states were rejected',
  'when they made important worst cases slower. No benchmark-specific dispatch was added.',
  '',
  'VALIDATION',
  '18 unit tests passed with --opt=dev, including independent complete fixed-code equivalence.',
  'The pinned in-process LLVM test loader reports undefined symbol memset_pattern16 for',
  'the new comparison test. Standalone LLVM speed executables link and run successfully.',
  'Expanded LLVM speed integration tests passed: gzip interop,',
  '630 edge inputs at each of 13 levels, libdeflate byte identity at levels 1–12,',
  'round trips, compress_bound checks, truncation/bit-flip checks, and compression-ratio gates.',
  'The expanded cases include 32767/32768/32769-byte window boundaries and two-byte repeats.',
  'They also cover changing repeated-byte runs, lengths around 258, and more window boundaries.',
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
