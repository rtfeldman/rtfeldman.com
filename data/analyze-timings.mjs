// Recompute both systems' summaries from the retained, unrounded timings.
// Run from any directory with: node data/analyze-timings.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const corpora = 'dickens mozilla mr nci ooffice osdb reymont samba sao webster x-ray xml'.split(' ');
const engines = ['libdeflate', 'roc-deflate'];
const columns = 'engine,level,corpus,input_bytes,round,rep,ns,mb_per_s,compressed_bytes'.split(',');
const key = r => [r.engine, r.level, r.corpus, r.round, r.rep].join('|');
const mean = a => a.reduce((s, n) => s + n, 0) / a.length;
function quantile(a, p) {
  const sorted = [...a].sort((a, b) => a - b);
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const median = a => quantile(a, 0.5);
function csv(file, rows) {
  const names = Object.keys(rows[0]);
  const escape = v => /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v);
  fs.writeFileSync(file, [names.join(','), ...rows.map(r => names.map(n => escape(r[n])).join(','))].join('\n') + '\n');
}

const expected = new Set();
for (let level = 1; level <= 12; level++) for (const corpus of corpora) for (const engine of engines) {
  for (let round = 1; round <= (level <= 9 ? 3 : 2); round++) {
    for (let rep = 1; rep <= (level <= 9 ? 5 : 3); rep++) expected.add(key({ engine, level, corpus, round, rep }));
  }
}

export function analyze(directory, machine) {
  const dir = path.join(root, directory);
  const lines = fs.readFileSync(path.join(dir, 'roc-deflate-compression-timings.csv'), 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.shift(), columns.join(','));
  const rows = lines.map(line => {
    const cells = line.split(',');
    assert.equal(cells.length, columns.length);
    return Object.fromEntries(cells.map((v, i) => [columns[i], i === 0 || i === 2 ? v : Number(v)]));
  });
  const actual = new Set(rows.map(key));
  assert.equal(rows.length, expected.size, `${machine}: sample count`);
  assert.equal(actual.size, rows.length, `${machine}: duplicate samples`);
  assert.deepEqual(actual, expected, `${machine}: expected sample keys`);
  const raw = fs.readFileSync(path.join(dir, 'raw.tsv'), 'utf8').trim().split(/\r?\n/);
  assert.equal(raw.length, rows.length);
  rows.forEach((r, i) => {
    for (const c of columns.slice(3)) assert.ok(Number.isFinite(r[c]) && r[c] > 0, `${machine}: ${key(r)} ${c}`);
    assert.ok(Math.abs(r.mb_per_s - r.input_bytes / r.ns * 1000) <= 0.00501, `${machine}: throughput`);
    assert.deepEqual(raw[i].split('\t'), columns.filter(c => c !== 'mb_per_s').map(c => String(r[c])), `${machine}: raw TSV row ${i + 1}`);
  });
  assert.equal(fs.readFileSync(path.join(dir, 'differ.txt'), 'utf8').trim(), '', `${machine}: compressed output mismatch log`);

  const cases = [];
  for (let level = 1; level <= 12; level++) for (const corpus of corpora) {
    const subset = rows.filter(r => r.level === level && r.corpus === corpus);
    assert.equal(new Set(subset.map(r => r.input_bytes)).size, 1);
    assert.equal(new Set(subset.map(r => r.compressed_bytes)).size, 1);
    const c = { level, corpus, input_bytes: subset[0].input_bytes, compressed_bytes: subset[0].compressed_bytes };
    for (const [e, prefix] of [['libdeflate', 'c'], ['roc-deflate', 'roc']]) {
      const ns = subset.filter(r => r.engine === e).map(r => r.ns);
      c.samples_per_engine = ns.length;
      c[`${prefix}_median_ns`] = median(ns);
      c[`${prefix}_median_mb_per_s`] = median(ns.map(n => c.input_bytes / n * 1000));
      c[`${prefix}_min_ns`] = Math.min(...ns);
      c[`${prefix}_max_ns`] = Math.max(...ns);
      c[`${prefix}_iqr_percent_of_median`] = (quantile(ns, 0.75) - quantile(ns, 0.25)) / median(ns) * 100;
    }
    c.roc_extra_time_percent = (c.roc_median_ns / c.c_median_ns - 1) * 100;
    c.roc_lower_throughput_percent = (1 - c.c_median_ns / c.roc_median_ns) * 100;
    c.gist_throughput_ratio_gap_percent = (c.c_median_mb_per_s / c.roc_median_mb_per_s - 1) * 100;
    cases.push(c);
  }

  function aggregate(subset) {
    const gaps = subset.map(c => c.roc_extra_time_percent);
    const cTime = subset.reduce((s, c) => s + c.c_median_ns, 0);
    const rocTime = subset.reduce((s, c) => s + c.roc_median_ns, 0);
    const bytes = subset.reduce((s, c) => s + c.input_bytes, 0);
    const ranked = [...subset].sort((a, b) => a.roc_extra_time_percent - b.roc_extra_time_percent);
    return {
      cases: subset.length,
      roc_faster_cases: gaps.filter(g => g < 0).length,
      c_faster_cases: gaps.filter(g => g > 0).length,
      tied_cases: gaps.filter(g => g === 0).length,
      cases_within_5_percent: gaps.filter(g => Math.abs(g) <= 5).length,
      cases_within_10_percent: gaps.filter(g => Math.abs(g) <= 10).length,
      cases_within_15_percent: gaps.filter(g => Math.abs(g) <= 15).length,
      cases_within_20_percent: gaps.filter(g => Math.abs(g) <= 20).length,
      median_roc_extra_time_percent: median(gaps),
      mean_roc_extra_time_percent: mean(gaps),
      geometric_mean_roc_extra_time_percent: (Math.exp(mean(subset.map(c => Math.log(c.roc_median_ns / c.c_median_ns)))) - 1) * 100,
      p10_roc_extra_time_percent: quantile(gaps, 0.1),
      p25_roc_extra_time_percent: quantile(gaps, 0.25),
      p75_roc_extra_time_percent: quantile(gaps, 0.75),
      p90_roc_extra_time_percent: quantile(gaps, 0.9),
      min_roc_extra_time_percent: ranked[0].roc_extra_time_percent,
      min_case: `L${ranked[0].level} ${ranked[0].corpus}`,
      max_roc_extra_time_percent: ranked.at(-1).roc_extra_time_percent,
      max_case: `L${ranked.at(-1).level} ${ranked.at(-1).corpus}`,
      c_median_mb_per_s_across_cases: median(subset.map(c => c.c_median_mb_per_s)),
      roc_median_mb_per_s_across_cases: median(subset.map(c => c.roc_median_mb_per_s)),
      gist_median_throughput_ratio_gap_percent: median(subset.map(c => c.gist_throughput_ratio_gap_percent)),
      total_input_bytes: bytes,
      c_sum_median_ns: cTime,
      roc_sum_median_ns: rocTime,
      total_roc_extra_time_percent: (rocTime / cTime - 1) * 100,
      c_whole_workload_mb_per_s: bytes / cTime * 1000,
      roc_whole_workload_mb_per_s: bytes / rocTime * 1000,
      c_median_case_iqr_percent: median(subset.map(c => c.c_iqr_percent_of_median)),
      roc_median_case_iqr_percent: median(subset.map(c => c.roc_iqr_percent_of_median)),
    };
  }
  const summary = { machine, directory, samples: rows.length, ...aggregate(cases) };
  csv(path.join(dir, 'per-file-summary.csv'), cases);
  csv(path.join(dir, 'per-level-summary.csv'), Array.from({ length: 12 }, (_, i) => ({ level: i + 1, ...aggregate(cases.filter(c => c.level === i + 1)) })));
  csv(path.join(dir, 'per-corpus-summary.csv'), corpora.map(corpus => ({ corpus, ...aggregate(cases.filter(c => c.corpus === corpus)) })));
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return { summary, rows, cases };
}

export function writeReferenceReports() {
  const systems = [
    analyze('x64-2026-10-21-final', 'AMD Ryzen 9 3900X / Linux x86-64'),
    analyze('macos-aarch64-2026-10-21', 'Apple M1 Pro / macOS aarch64'),
  ];
  const other = new Map(systems[1].rows.map(r => [key(r), r]));
  for (const r of systems[0].rows) {
    assert.equal(r.input_bytes, other.get(key(r)).input_bytes, `cross-system input size: ${key(r)}`);
    assert.equal(r.compressed_bytes, other.get(key(r)).compressed_bytes, `cross-system output size: ${key(r)}`);
  }
  csv(path.join(root, 'comparison-summary.csv'), systems.map(s => s.summary));
  const fmt = n => n.toFixed(2);
  const report = [
    'Roc versus libdeflate compression timings — revised 2026-10-21 runs',
    '',
    'Sources: roc 5e62c0e13ae779c28f7904dcdd2849ba13240beb (PR #12501);',
    'roc-deflate 16578ed0f16f83a1eb7491568c983446f622fd4a (PR #6);',
    'libdeflate b122c8be1d78b19f6d0a6efc5bb79bfcbb30dd51;',
    'mimalloc 8c532c32c3c96e5ba1f2283e032f69ead8add00f (v2.1.7); Zig 0.17.0.',
    'Procedure: https://gist.github.com/rtfeldman/7b6830809149867b79761ffb8e0456c3',
    '',
    'HOW TO READ THE NUMBERS',
    'Each case is one file at one compression level. Each engine has 15 samples',
    'per case at levels 1–9 and 6 samples at levels 10–12, across 3 or 2 rounds.',
    'The primary gap is (median Roc ns / median C ns - 1) * 100.',
    'Positive means Roc takes more time; negative means Roc takes less time.',
    'Overall median, mean, geometric mean, and quantiles weight all 144 cases equally.',
    'Whole-workload time sums the per-case median times: compress each of the',
    '12 files once at each of the 12 levels. This weights expensive cases more.',
    'Throughput uses decimal MB/s over uncompressed bytes.',
    'Per-level throughput columns are independent medians across files; their ratio',
    'does not in general equal the median of the per-file ratios.',
    'The procedure computes median sample throughput before taking ratios. That',
    'can differ slightly from ratios of median times for the even sample counts',
    'at levels 10–12. Both definitions are retained in the summary CSVs.',
    '',
    'VALIDATION',
    'Both datasets have all 3,672 unique expected samples, no missing or extra keys.',
    'Raw TSV and CSV agree row for row; positive timings and rounded MB/s checked.',
    'Each file/level has one input size and one output size across both engines.',
    'All corresponding input and compressed-output sizes match across systems.',
    'Both output-mismatch logs are empty; both completed runs report byte-identical outputs.',
    'File sizes alone are not hashes; cross-system byte identity is not established',
    'by the CSV. Within-run cmp checks provide the byte-identity evidence.',
    '',
    'METHOD AND LIMITS',
    'Compression only; reads, warmup/round-trip verification, output writes, and',
    'per-repetition logging are outside the measured interval. C reuses a compressor',
    'and output buffer; Roc measures Deflate.compress_into with a reused output buffer',
    'and includes allocation/cleanup of its internal compression work structures.',
    'C is built with cc -O3, Roc compiler with ReleaseFast, Roc app with --opt=speed.',
    'Both engines use mimalloc 2.1.7: Linux preloads C and statically links Roc;',
    'macOS preloads both. Engines run in fixed C-then-Roc order within each round.',
    'Post-run macOS dyld diagnostics confirm that mimalloc interposed malloc and',
    'free in both actual executables; those diagnostic invocations are separate',
    'from the timed dataset. Their logs are retained beside the Mac data.',
    'These replace earlier results after compiler loop/vectorization and bounds-check',
    'changes, compressor hot-loop changes, and the Linux static-Roc allocator fix.',
    'The earlier Linux and Mac numbers are not retained as current benchmark results.',
    'One full run per system; no confidence intervals or claim that CPU architecture',
    'alone caused the difference. CPU, OS, C compiler, libc, and system load differ.',
    'The Mac was an active user desktop without CPU affinity or frequency controls.',
    '',
  ];
  for (const { summary: s, cases } of systems) {
    report.push(
      s.machine.toUpperCase(),
      `Samples: ${s.samples}; cases: ${s.cases}; Roc faster: ${s.roc_faster_cases}; C faster: ${s.c_faster_cases}; ties: ${s.tied_cases}.`,
      `Median gap: ${fmt(s.median_roc_extra_time_percent)}%; mean: ${fmt(s.mean_roc_extra_time_percent)}%; geometric mean: ${fmt(s.geometric_mean_roc_extra_time_percent)}%.`,
      `Gap distribution: p10 ${fmt(s.p10_roc_extra_time_percent)}%; p25 ${fmt(s.p25_roc_extra_time_percent)}%; p75 ${fmt(s.p75_roc_extra_time_percent)}%; p90 ${fmt(s.p90_roc_extra_time_percent)}%.`,
      `Cases within +/-5%: ${s.cases_within_5_percent}; +/-10%: ${s.cases_within_10_percent}; +/-15%: ${s.cases_within_15_percent}; +/-20%: ${s.cases_within_20_percent}.`,
      `Fastest relative case: ${s.min_case}, ${fmt(s.min_roc_extra_time_percent)}%.`,
      `Slowest relative case: ${s.max_case}, ${fmt(s.max_roc_extra_time_percent)}%.`,
      `Whole workload: C ${fmt(s.c_sum_median_ns / 1e9)} s; Roc ${fmt(s.roc_sum_median_ns / 1e9)} s; gap ${fmt(s.total_roc_extra_time_percent)}%.`,
      `Whole workload throughput: C ${fmt(s.c_whole_workload_mb_per_s)} MB/s; Roc ${fmt(s.roc_whole_workload_mb_per_s)} MB/s.`,
      `Median per-case timing IQR / median: C ${fmt(s.c_median_case_iqr_percent)}%; Roc ${fmt(s.roc_median_case_iqr_percent)}%.`,
      '',
      'PER LEVEL: level | C MB/s | Roc MB/s | median time gap % | Roc wins / 12',
    );
    for (let level = 1; level <= 12; level++) {
      const sub = cases.filter(c => c.level === level);
      report.push(`${level} | ${fmt(median(sub.map(c => c.c_median_mb_per_s)))} | ${fmt(median(sub.map(c => c.roc_median_mb_per_s)))} | ${fmt(median(sub.map(c => c.roc_extra_time_percent)))} | ${sub.filter(c => c.roc_extra_time_percent < 0).length}`);
    }
    report.push('', 'PER CORPUS: file | median time gap across levels % | Roc wins / 12');
    for (const corpus of corpora) {
      const sub = cases.filter(c => c.corpus === corpus);
      report.push(`${corpus} | ${fmt(median(sub.map(c => c.roc_extra_time_percent)))} | ${sub.filter(c => c.roc_extra_time_percent < 0).length}`);
    }
    report.push('', 'GROUPED LEVELS: levels | median time gap % | Roc wins / cases');
    for (const [label, sub] of [['1–9', cases.filter(c => c.level <= 9)], ['10–12', cases.filter(c => c.level >= 10)]]) {
      report.push(`${label} | ${fmt(median(sub.map(c => c.roc_extra_time_percent)))} | ${sub.filter(c => c.roc_extra_time_percent < 0).length}/${sub.length}`);
    }
    const ranked = [...cases].sort((a, b) => a.roc_extra_time_percent - b.roc_extra_time_percent);
    for (const [label, subset] of [['TEN LOWEST GAPS', ranked.slice(0, 10)], ['TEN HIGHEST GAPS', ranked.slice(-10).reverse()]]) {
      report.push('', `${label}: level | file | time gap % | C MB/s | Roc MB/s`);
      for (const c of subset) report.push(`${c.level} | ${c.corpus} | ${fmt(c.roc_extra_time_percent)} | ${fmt(c.c_median_mb_per_s)} | ${fmt(c.roc_median_mb_per_s)}`);
    }
    report.push('');
  }
  fs.writeFileSync(path.join(root, 'report.txt'), report.join('\n').trimEnd() + '\n');
  for (const s of systems) console.log(JSON.stringify(s.summary, null, 2));
  console.log('Validated exact sample keys, raw TSV/CSV, throughputs, output-size consistency, empty mismatch logs, and cross-system input/output sizes.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeReferenceReports();
