// Recompute the latest embedded-input macOS comparison from retained raw samples.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './analyze-timings.mjs';
import { analyzeLinuxFinal, linuxDirectory } from './analyze-linux-final.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const beforeDir = 'macos-before-2026-10-22';
const afterDir = 'macos-optimization-2026-10-22';
const sampling = () => ({ rounds: 3, reps: 5 });
const before = analyze(beforeDir, 'Apple M1 Pro / macOS aarch64 — before', sampling);
const after = analyze(afterDir, 'Apple M1 Pro / macOS aarch64 — latest', sampling);
const getJSON = (dir, file) => JSON.parse(fs.readFileSync(path.join(root, dir, file), 'utf8'));
const meta = getJSON(afterDir, 'provenance.json');
const beforeMeta = getJSON(beforeDir, 'provenance.json');
const linuxResult = analyzeLinuxFinal();
const linux = linuxResult.summary;
const previousLinux = getJSON('x64-2026-10-21-final', 'summary.json');
const q = (xs, p) => { const a = [...xs].sort((x,y) => x-y), i=(a.length-1)*p; return a[Math.floor(i)] + (a[Math.ceil(i)]-a[Math.floor(i)])*(i-Math.floor(i)); };
const med = xs => q(xs,.5);
const fmt = n => n.toFixed(2);
const caseKey = c => `${c.corpus}|${c.level}`;
const key = r => `${r.corpus}|${r.level}|${r.round}|${r.rep}`;
const beforeC = new Map(before.rows.filter(r=>r.engine==='libdeflate').map(r=>[key(r),r]));
for (const r of after.rows.filter(r=>r.engine==='libdeflate')) assert.deepEqual(r,beforeC.get(key(r)), 'Both variants must share exactly the same C samples');
const oldCases = new Map(before.cases.map(c=>[caseKey(c),c]));
const changes = after.cases.map(c=> {
 const b=oldCases.get(caseKey(c));
 assert.equal(c.input_bytes,b.input_bytes); assert.equal(c.compressed_bytes,b.compressed_bytes);
 return { corpus:c.corpus, level:c.level, before_gap_percent:b.roc_extra_time_percent,
  after_gap_percent:c.roc_extra_time_percent, change_percentage_points:c.roc_extra_time_percent-b.roc_extra_time_percent,
  roc_time_change_percent:(c.roc_median_ns/b.roc_median_ns-1)*100,
  before_roc_ns:b.roc_median_ns, after_roc_ns:c.roc_median_ns, common_c_ns:c.c_median_ns };
});
function csv(file, rows) { const cols=Object.keys(rows[0]); const enc=x=>JSON.stringify(x); fs.writeFileSync(path.join(root,afterDir,file),[cols.join(','),...rows.map(r=>cols.map(c=>typeof r[c]==='string'?enc(r[c]):r[c]).join(','))].join('\n')+'\n'); }
csv('before-after.csv',changes);
const perRound=[];
for(let round=1;round<=3;round++) for(const c of after.cases) {
 const rows=after.rows.filter(r=>r.round===round&&r.corpus===c.corpus&&r.level===c.level);
 const ns=e=>med(rows.filter(r=>r.engine===e).map(r=>r.ns));
 perRound.push({round,corpus:c.corpus,level:c.level,c_median_ns:ns('libdeflate'),roc_median_ns:ns('roc-deflate'),gap_percent:(ns('roc-deflate')/ns('libdeflate')-1)*100});
}
csv('per-round-gaps.csv',perRound);
const s=after.summary,b=before.summary;
const linuxMeta = linuxResult.provenance;
const current = [
 {dataset:afterDir,machine:'Apple M1 Pro / macOS aarch64',compiler_commit:meta.compiler_commit,library_commit:meta.library_commit,...Object.fromEntries(['median_roc_extra_time_percent','max_roc_extra_time_percent','max_case','min_roc_extra_time_percent','min_case','roc_faster_cases'].map(k=>[k,s[k]]))},
 {dataset:linuxDirectory,machine:'AMD Ryzen 9 3900X / Linux x64',compiler_commit:linuxMeta.sources.roc,library_commit:linuxMeta.sources['roc-deflate'],...Object.fromEntries(['median_roc_extra_time_percent','max_roc_extra_time_percent','max_case','min_roc_extra_time_percent','min_case','roc_faster_cases'].map(k=>[k,linux[k]]))},
];
const currentCols=Object.keys(current[0]);
fs.writeFileSync(path.join(root,'current-comparison-summary.csv'), [currentCols.join(','),...current.map(r=>currentCols.map(c=>JSON.stringify(r[c])).join(','))].join('\n')+'\n');
fs.copyFileSync(path.join(root,'current-comparison-summary.csv'),path.join(root,'comparison-summary.csv'));
const currentCases = [...after.cases.map(c=>({dataset:afterDir,data_basis:'raw elapsed ns',...c})),
 ...linuxResult.cases.map(c=>({dataset:linuxDirectory,data_basis:'median MB/s rounded to 0.1',...c}))];
const caseCols=['dataset','data_basis','level','corpus','c_median_mb_per_s','roc_median_mb_per_s','roc_extra_time_percent'];
fs.writeFileSync(path.join(root,'current-per-file-summary.csv'),[caseCols.join(','),...currentCases.map(c=>caseCols.map(k=>JSON.stringify(c[k])).join(','))].join('\n')+'\n');
const ranked=[...after.cases].sort((a,b)=>b.roc_extra_time_percent-a.roc_extra_time_percent);
const comparison={ before:b, after:s, median_roc_time_change_percent:med(changes.map(c=>c.roc_time_change_percent)),
 geometric_mean_roc_time_change_percent:(Math.exp(changes.reduce((sum,c)=>sum+Math.log(c.after_roc_ns/c.before_roc_ns),0)/changes.length)-1)*100,
 cases_faster_than_before:changes.filter(c=>c.roc_time_change_percent<0).length,
 cases_at_least_1_percent_faster:changes.filter(c=>c.roc_time_change_percent<=-1).length,
 cases_at_least_1_percent_slower:changes.filter(c=>c.roc_time_change_percent>=1).length,
 p95_gap_percent:q(ranked.map(c=>c.roc_extra_time_percent),.95),p99_gap_percent:q(ranked.map(c=>c.roc_extra_time_percent),.99),
 rounded_up_worst_gap_percent:Math.ceil(s.max_roc_extra_time_percent*10)/10 };
fs.writeFileSync(path.join(root,afterDir,'comparison.json'),JSON.stringify(comparison,null,2)+'\n');
const report=[
 'Roc versus libdeflate — current macOS and Linux benchmarks, 2026-10-22','',
 `Current Mac median: ${fmt(s.median_roc_extra_time_percent)}%; range ${fmt(s.min_roc_extra_time_percent)}% to +${fmt(s.max_roc_extra_time_percent)}%; Roc wins ${s.roc_faster_cases}/144.`,
 `Current Linux median: ${fmt(linux.median_roc_extra_time_percent)}%; range ${fmt(linux.min_roc_extra_time_percent)}% to +${fmt(linux.max_roc_extra_time_percent)}%; Roc wins ${linux.roc_faster_cases}/144.`,
 'Linux values are calculated from rounded median throughputs; macOS values use retained raw times.',
 'These datasets share a compiler version but differ in library version, harness and sampling protocol.',
 '', 'LATEST MACOS', '',
 `Across these 144 Silesia file/level cases on this Apple M1 Pro, Roc's median elapsed time was no more than ${comparison.rounded_up_worst_gap_percent.toFixed(1)}% above libdeflate's.`,
 `This is a bound on the measured case medians, not on every individual repetition or all macOS workloads.`,
 '', 'CURRENT SOURCES',
 `Library pull request: ${meta.library_pr}`,`Roc compiler: ${meta.compiler_commit}`,`roc-deflate: ${meta.library_commit}`,`libdeflate: ${meta.libdeflate_commit}`,`Allocator: static mimalloc 2.1.7 (${meta.mimalloc_commit}).`,
 'Exact source hashes, binary hashes, platform sources, raw stdout and run metadata accompany the CSVs.',
 '', 'RESULTS',
 `Worst case: ${s.max_case}, ${fmt(s.max_roc_extra_time_percent)}% extra time.`,
 `Best case: ${s.min_case}, ${fmt(s.min_roc_extra_time_percent)}% extra time.`,
 `Median gap: ${fmt(s.median_roc_extra_time_percent)}%; mean: ${fmt(s.mean_roc_extra_time_percent)}%; geometric mean: ${fmt(s.geometric_mean_roc_extra_time_percent)}%.`,
 `Gap percentiles: p10 ${fmt(s.p10_roc_extra_time_percent)}%; p25 ${fmt(s.p25_roc_extra_time_percent)}%; p75 ${fmt(s.p75_roc_extra_time_percent)}%; p90 ${fmt(s.p90_roc_extra_time_percent)}%; p95 ${fmt(comparison.p95_gap_percent)}%; p99 ${fmt(comparison.p99_gap_percent)}%.`,
 `Roc faster: ${s.roc_faster_cases}/144; C faster: ${s.c_faster_cases}/144; tied: ${s.tied_cases}.`,
 `Within +/-5%: ${s.cases_within_5_percent}; +/-10%: ${s.cases_within_10_percent}; +/-15%: ${s.cases_within_15_percent}; +/-20%: ${s.cases_within_20_percent}.`,
 `One compression per case, summing medians: C ${fmt(s.c_sum_median_ns/1e9)} s; Roc ${fmt(s.roc_sum_median_ns/1e9)} s; Roc time difference ${fmt(s.total_roc_extra_time_percent)}%.`,
 `Whole-workload throughput: C ${fmt(s.c_whole_workload_mb_per_s)} MB/s; Roc ${fmt(s.roc_whole_workload_mb_per_s)} MB/s.`,
 '', 'PAIRED BEFORE / AFTER',
 'Both source versions used this same embedded-input platform, process lifetime, allocator and common C samples.',
 `Before: Roc ${beforeMeta.compiler_commit}; library ${beforeMeta.library_commit}.`,
 `Worst gap: ${fmt(b.max_roc_extra_time_percent)}% (${b.max_case}) -> ${fmt(s.max_roc_extra_time_percent)}% (${s.max_case}).`,
 `Median gap: ${fmt(b.median_roc_extra_time_percent)}% -> ${fmt(s.median_roc_extra_time_percent)}%.`,
 `Cases faster than libdeflate: ${b.roc_faster_cases}/144 -> ${s.roc_faster_cases}/144.`,
 `Median case change in Roc elapsed time: ${fmt(comparison.median_roc_time_change_percent)}%; geometric mean change: ${fmt(comparison.geometric_mean_roc_time_change_percent)}%.`,
 `${comparison.cases_faster_than_before}/144 cases have lower Roc medians; ${comparison.cases_at_least_1_percent_faster} improve by at least 1%; ${comparison.cases_at_least_1_percent_slower} regress by at least 1%. Small changes may be timing noise.`,
 '', 'VARIABILITY',
 `Median case IQR / median: C ${fmt(s.c_median_case_iqr_percent)}%; Roc ${fmt(s.roc_median_case_iqr_percent)}%.`,
];
for(let round=1;round<=3;round++) {
 const rows=perRound.filter(r=>r.round===round),worst=rows.reduce((a,b)=>a.gap_percent>b.gap_percent?a:b);
 report.push(`Round ${round}: median gap ${fmt(med(rows.map(r=>r.gap_percent)))}%; maximum ${fmt(worst.gap_percent)}% (${worst.corpus} L${worst.level}).`);
}
const table=(title,cases)=>{report.push('',title,'file | level | gap % | C ms | Roc ms | C MB/s | Roc MB/s'); for(const c of cases)report.push(`${c.corpus} | ${c.level} | ${fmt(c.roc_extra_time_percent)} | ${fmt(c.c_median_ns/1e6)} | ${fmt(c.roc_median_ns/1e6)} | ${fmt(c.c_median_mb_per_s)} | ${fmt(c.roc_median_mb_per_s)}`);};
table('TEN LARGEST RELATIVE GAPS',ranked.slice(0,10));table('TEN SMALLEST RELATIVE GAPS',ranked.slice(-10).reverse());
table('FASTEST ROC THROUGHPUT', [...after.cases].sort((a,b)=>b.roc_median_mb_per_s-a.roc_median_mb_per_s).slice(0,3));
table('FASTEST C THROUGHPUT', [...after.cases].sort((a,b)=>b.c_median_mb_per_s-a.c_median_mb_per_s).slice(0,3));
const absolute=[...after.cases].sort((a,b)=>(b.roc_median_ns-b.c_median_ns)-(a.roc_median_ns-a.c_median_ns));
table('FIVE LARGEST ABSOLUTE TIME PENALTIES',absolute.slice(0,5));table('FIVE LARGEST ABSOLUTE TIME SAVINGS',absolute.slice(-5).reverse());
report.push('','PER LEVEL: level | median gap % | worst gap % | Roc wins / 12');
for(let level=1;level<=12;level++){const a=after.cases.filter(c=>c.level===level);report.push(`${level} | ${fmt(med(a.map(c=>c.roc_extra_time_percent)))} | ${fmt(Math.max(...a.map(c=>c.roc_extra_time_percent)))} | ${a.filter(c=>c.roc_extra_time_percent<0).length}/12`);}
report.push('','PER CORPUS: file | median gap % | worst gap % | Roc wins / 12');
for(const corpus of [...new Set(after.cases.map(c=>c.corpus))]){const a=after.cases.filter(c=>c.corpus===corpus);report.push(`${corpus} | ${fmt(med(a.map(c=>c.roc_extra_time_percent)))} | ${fmt(Math.max(...a.map(c=>c.roc_extra_time_percent)))} | ${a.filter(c=>c.roc_extra_time_percent<0).length}/12`);}
report.push('','BEFORE / AFTER BY LEVEL: level | before median gap % | after median gap % | change in percentage points');
for(let level=1;level<=12;level++) {
 const old=med(before.cases.filter(c=>c.level===level).map(c=>c.roc_extra_time_percent));
 const now=med(after.cases.filter(c=>c.level===level).map(c=>c.roc_extra_time_percent));
 report.push(`${level} | ${fmt(old)} | ${fmt(now)} | ${fmt(now-old)}`);
}
const changed=[...changes].sort((a,b)=>a.roc_time_change_percent-b.roc_time_change_percent);
for(const [title,rows] of [['TEN LARGEST IMPROVEMENTS IN ROC ELAPSED TIME',changed.slice(0,10)],['TEN LARGEST REGRESSIONS (OR SMALLEST IMPROVEMENTS) IN ROC ELAPSED TIME',changed.slice(-10).reverse()]]) {
 report.push('',title,'file | level | before gap % | after gap % | Roc elapsed time change %');
 for(const c of rows)report.push(`${c.corpus} | ${c.level} | ${fmt(c.before_gap_percent)} | ${fmt(c.after_gap_percent)} | ${fmt(c.roc_time_change_percent)}`);
}
report.push('','PROTOCOL AND LIMITS',
 '12 Silesia files x 12 levels; 3 rounds x 5 timed repetitions = 15 samples per engine per case.',
 'There are 6,480 unique timed compressions across the common C engine and the two Roc versions. Each before/after CSV has 4,320 rows, sharing the same 2,160 C observations.',
 'The common C engine and the before/after Roc engines rotate execution positions across the three rounds.',
 'Both drivers embed the same input bytes. Each file/level case runs in its own fresh process; Roc selects the case from a runtime integer passed through its entrypoint.',
 'Each engine warms its reusable output buffer for at least 200 ms, including its first compression and round-trip check.',
 'Warmup, round-trip checks, exact compressed-byte comparisons, allocation of output capacity, clearing the output buffer, and printing are outside each timing interval.',
 'C reuses its compressor; Roc includes creation/cleanup of internal scratch structures in compress_into. Both reuse output capacity.',
 'The platform exposes only echo! and monotonic now!, with mimalloc linked directly into both engines. No runtime file reads enter the measurements.',
 'Every timed output is checked against the reference bytes. See the separately retained unit, interop, edge-length, ratio and platform test logs.',
 'Each case gap is (median Roc ns / median C ns - 1) * 100; positive means more elapsed time. Throughput is decimal MB/s.',
 'The machine is a shared desktop, without CPU pinning or frequency controls. Our own builds/tests/profiling did not overlap this final run.',
 'These samples form a new series. Earlier basic-cli/preload timings and exploratory per-file batches use different platforms or process protocols, so their maxima are not controlled before/after comparisons.',
 '', ...linuxResult.report,
 'HISTORICAL COMPARISONS',
 `Supplied Linux series: median gap ${fmt(previousLinux.median_roc_extra_time_percent)}% -> ${fmt(linux.median_roc_extra_time_percent)}%; maximum ${fmt(previousLinux.max_roc_extra_time_percent)}% -> ${fmt(linux.max_roc_extra_time_percent)}%; Roc wins ${previousLinux.roc_faster_cases} -> ${linux.roc_faster_cases}/144.`,
 'The Linux change is descriptive only: compiler, library, CPU pinning and sampling changed; the new archive retains rounded medians rather than raw samples.',
 'The superseded Linux archive is retained at x64-2026-10-21-final/ solely for the historical matched-version reference and previous reports.',
 'The earlier matched-version comparison is preserved in reference-report.txt and macos-aarch64-2026-10-21/.',
 '','Recompute: node data/analyze-embedded-benchmarks.mjs','');
fs.writeFileSync(path.join(root,afterDir,'report.txt'),report.join('\n'));
fs.copyFileSync(path.join(root,afterDir,'report.txt'),path.join(root,'report.txt'));
console.log(JSON.stringify(comparison,null,2));
