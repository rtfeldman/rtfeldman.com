// Analyze the supplied rounded Linux medians without inventing raw repetitions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const linuxDirectory = 'x64-2026-10-22-final';
const dir = path.join(root, linuxDirectory);
const corpora = 'dickens mozilla mr nci ooffice osdb reymont samba sao webster x-ray xml'.split(' ');
const quantile = (xs, p) => {
  const a = [...xs].sort((a,b) => a-b), i = (a.length-1)*p;
  return a[Math.floor(i)] + (a[Math.ceil(i)]-a[Math.floor(i)])*(i-Math.floor(i));
};
const median = xs => quantile(xs,.5);
const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
const fmt = x => x.toFixed(2);
const label = c => `L${c.level} ${c.corpus}`;
function csv(file, rows) {
  const cols = Object.keys(rows[0]);
  fs.writeFileSync(path.join(dir,file), [cols.join(','),...rows.map(r=>cols.map(k=>JSON.stringify(r[k])).join(','))].join('\n')+'\n');
}
function aggregate(cases) {
  const gaps = cases.map(c=>c.roc_extra_time_percent);
  const ranked = [...cases].sort((a,b)=>a.roc_extra_time_percent-b.roc_extra_time_percent);
  return {
    cases: cases.length,
    roc_faster_cases: gaps.filter(g=>g<0).length,
    c_faster_cases: gaps.filter(g=>g>0).length,
    tied_cases: gaps.filter(g=>g===0).length,
    ...Object.fromEntries([5,10,15,20].map(n=>[`cases_within_${n}_percent`,gaps.filter(g=>Math.abs(g)<=n).length])),
    cases_no_more_than_10_percent_slower: gaps.filter(g=>g<=10).length,
    cases_no_more_than_15_percent_slower: gaps.filter(g=>g<=15).length,
    median_roc_extra_time_percent: median(gaps),
    mean_roc_extra_time_percent: mean(gaps),
    geometric_mean_roc_extra_time_percent: (Math.exp(mean(cases.map(c=>Math.log(c.c_median_mb_per_s/c.roc_median_mb_per_s))))-1)*100,
    ...Object.fromEntries([10,25,75,90,95,99].map(p=>[`p${p}_roc_extra_time_percent`,quantile(gaps,p/100)])),
    min_roc_extra_time_percent: ranked[0].roc_extra_time_percent,
    min_case: label(ranked[0]),
    max_roc_extra_time_percent: ranked.at(-1).roc_extra_time_percent,
    max_case: label(ranked.at(-1)),
    // Bounds from +/-0.05 MB/s rounding only, not statistical confidence bounds.
    median_gap_rounding_lower_percent: median(cases.map(c=>c.gap_rounding_lower_percent)),
    median_gap_rounding_upper_percent: median(cases.map(c=>c.gap_rounding_upper_percent)),
    max_gap_rounding_lower_percent: Math.max(...cases.map(c=>c.gap_rounding_lower_percent)),
    max_gap_rounding_upper_percent: Math.max(...cases.map(c=>c.gap_rounding_upper_percent)),
  };
}

export function analyzeLinuxFinal() {
  const provenance = JSON.parse(fs.readFileSync(path.join(dir,'archive-provenance.json'),'utf8'));
  for(const [file,hash] of Object.entries(provenance.files_sha256)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex'),hash,`Archive file changed: ${file}`);
  }
  const expected = new Set(corpora.flatMap(c=>Array.from({length:12},(_,i)=>`${i+1}|${c}`)));
  const seen = new Set();
  const lines = fs.readFileSync(path.join(dir,'medians.txt'),'utf8').trim().split(/\r?\n/);
  assert.equal(lines.pop(),'done','Expected completed median table');
  const cases = lines.map(line=> {
    const m = /^L(\d+) (\S+) cbench_raw=(\d+\.\d) ctime_lw=(\d+\.\d)$/.exec(line);
    assert.ok(m,`Invalid median row: ${line}`);
    const [,l,corpus,c,r] = m, level=Number(l), C=Number(c), R=Number(r), key=`${level}|${corpus}`;
    assert.ok(expected.has(key) && !seen.has(key),`Unexpected or duplicate case: ${key}`);
    assert.ok(C>0 && R>0); seen.add(key);
    return {level,corpus,reported_repetitions_per_engine:7,c_median_mb_per_s:C,roc_median_mb_per_s:R,
      roc_extra_time_percent:(C/R-1)*100,roc_lower_throughput_percent:(1-R/C)*100,
      gap_rounding_lower_percent:((C-.05)/(R+.05)-1)*100,
      gap_rounding_upper_percent:((C+.05)/(R-.05)-1)*100};
  });
  assert.deepEqual(seen,expected);
  const byKey = new Map(cases.map(c=>[`${c.level}|${c.corpus}`,c]));
  const gapRows = [...fs.readFileSync(path.join(dir,'gaps.txt'),'utf8').matchAll(/^L(\d+)\s+(\S+)\s+(\d+\.\d)\s+(\d+\.\d)\s+([+-]\d+\.\d)%$/gm)];
  assert.equal(gapRows.length,144);
  const gapKeys = new Set();
  for(const [,level,corpus,c,r,gap] of gapRows) {
    const key=`${level}|${corpus}`, row=byKey.get(key);
    assert.ok(row && !gapKeys.has(key)); gapKeys.add(key);
    assert.equal(row.c_median_mb_per_s,Number(c)); assert.equal(row.roc_median_mb_per_s,Number(r));
    assert.ok(Math.abs(row.roc_extra_time_percent-Number(gap))<=.050001,`Gap disagreement: ${key}`);
  }
  const summary = {machine:'AMD Ryzen 9 3900X / Linux x64',directory:linuxDirectory,
    data_basis:'Median MB/s rounded to 0.1; raw samples not supplied',
    reported_samples:144*2*7,retained_raw_samples:0,...aggregate(cases)};
  csv('per-file-summary.csv',cases);
  csv('compression-medians.csv',cases.flatMap(c=>[['libdeflate',c.c_median_mb_per_s],['roc-deflate',c.roc_median_mb_per_s]].map(([engine,mb_per_s])=>({engine,level:c.level,corpus:c.corpus,median_mb_per_s:mb_per_s,reported_repetitions:7,precision_mb_per_s:0.1}))));
  csv('per-level-summary.csv',Array.from({length:12},(_,i)=>({level:i+1,...aggregate(cases.filter(c=>c.level===i+1))})));
  csv('per-corpus-summary.csv',corpora.map(corpus=>({corpus,...aggregate(cases.filter(c=>c.corpus===corpus))})));
  fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  const s=summary, ranked=[...cases].sort((a,b)=>b.roc_extra_time_percent-a.roc_extra_time_percent);
  const report = [
    'LATEST LINUX X64 — AMD Ryzen 9 3900X, 2026-10-22','',
    `Source: ${provenance.archive}; SHA-256 ${provenance.sha256}.`,
    `Roc ${provenance.sources.roc}; roc-deflate ${provenance.sources['roc-deflate']}; libdeflate ${provenance.sources.libdeflate}; mimalloc ${provenance.sources.mimalloc}.`,
    '12 Silesia files x 12 compression levels; 7 repetitions per engine per case, pinned to core 6.',
    'scripts/abp.sh runs each engine in turn for each case, computes median elapsed ns, converts to MB/s and rounds to one decimal.',
    'Only these rounded medians are retained: 288 engine/case aggregates representing 2,016 reported repetitions. No raw repetitions are supplied.',
    'Gap = (C median MB/s / Roc median MB/s - 1) * 100: extra Roc elapsed time. Positive is slower; negative is less time.',
    'All overall statistics weight the 144 cases equally. Extra displayed digits are calculations from rounded inputs, not extra measurement precision.','',
    `Median gap: ${fmt(s.median_roc_extra_time_percent)}%; mean ${fmt(s.mean_roc_extra_time_percent)}%; geometric mean ${fmt(s.geometric_mean_roc_extra_time_percent)}%.`,
    `Worst: ${s.max_case}, ${fmt(s.max_roc_extra_time_percent)}% extra time. Best: ${s.min_case}, ${fmt(s.min_roc_extra_time_percent)}% extra time.`,
    `Roc faster: ${s.roc_faster_cases}/144; C faster: ${s.c_faster_cases}; ties: ${s.tied_cases}.`,
    `Percentiles: ${[10,25,75,90,95,99].map(p=>`p${p} ${fmt(s[`p${p}_roc_extra_time_percent`])}%`).join('; ')}.`,
    `Within +/-5%: ${s.cases_within_5_percent}; +/-10%: ${s.cases_within_10_percent}; +/-15%: ${s.cases_within_15_percent}; +/-20%: ${s.cases_within_20_percent}.`,
    `No more than 10% slower: ${s.cases_no_more_than_10_percent_slower}/144; no more than 15% slower: ${s.cases_no_more_than_15_percent_slower}/144.`,
    `Median rounding interval: ${fmt(s.median_gap_rounding_lower_percent)}% to ${fmt(s.median_gap_rounding_upper_percent)}%; worst-case rounding interval: ${fmt(s.max_gap_rounding_lower_percent)}% to ${fmt(s.max_gap_rounding_upper_percent)}%. These are rounding limits, not confidence intervals.`,
    '', 'VALIDATION AND COMPARABILITY',
    'All 144 unique expected keys present; all 144 supplied gap rows agree with the medians at their stated precision; all seven archive files match their recorded SHA-256 hashes.',
    'The README reports byte-identical compressed output, but output files and check execution logs are absent; this import cannot independently recheck that claim.',
    'The README flags L1 dickens as bimodal (+9% to +21% across other pinned passes). The supplied row is +4.8%; those other passes are not included. No universal worst-case or stability guarantee follows from this one table.',
    'The unpinned repro-deflate-mimalloc.sh is a rebuild recipe, not the exact pinned measurement procedure; use scripts/abp.sh for the latter.',
    'Linux uses the basic-cli/musl harness, preloaded mimalloc for C and statically linked mimalloc for Roc. macOS uses embedded inputs and the minimal C platform, with static mimalloc for both.',
    'The current platforms share compiler d99c7b838f but use different roc-deflate commits (Linux 04cb55f; Mac 6710774) and measurement protocols. Differences cannot be attributed solely to CPU architecture.',
    'Linux lacks raw repetitions, so IQR, run-to-run variation and statistical confidence intervals cannot be recomputed.','',
  ];
  const table=(title,rows)=>{report.push(title,'case | gap % | C MB/s | Roc MB/s');for(const c of rows)report.push(`${label(c)} | ${fmt(c.roc_extra_time_percent)} | ${c.c_median_mb_per_s.toFixed(1)} | ${c.roc_median_mb_per_s.toFixed(1)}`);report.push('');};
  table('TEN LARGEST RELATIVE GAPS',ranked.slice(0,10));
  table('TEN SMALLEST RELATIVE GAPS',ranked.slice(-10).reverse());
  table('FASTEST ROC THROUGHPUT',[...cases].sort((a,b)=>b.roc_median_mb_per_s-a.roc_median_mb_per_s).slice(0,3));
  table('SLOWEST ROC THROUGHPUT',[...cases].sort((a,b)=>a.roc_median_mb_per_s-b.roc_median_mb_per_s).slice(0,3));
  for(const [name,keys,field] of [['LEVEL',Array.from({length:12},(_,i)=>i+1),'level'],['CORPUS',corpora,'corpus']]) {
    report.push(`PER ${name}: ${field} | median gap % | worst gap % | Roc wins / 12`);
    for(const k of keys) {const a=aggregate(cases.filter(c=>c[field]===k));report.push(`${k} | ${fmt(a.median_roc_extra_time_percent)} | ${fmt(a.max_roc_extra_time_percent)} | ${a.roc_faster_cases}/12`);}
    report.push('');
  }
  fs.writeFileSync(path.join(dir,'report.txt'),report.join('\n'));
  return {summary,cases,provenance,report};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(analyzeLinuxFinal().summary,null,2));
}
