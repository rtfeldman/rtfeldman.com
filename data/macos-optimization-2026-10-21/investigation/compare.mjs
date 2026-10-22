import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const work = '/private/tmp/roc-deflate-macos-2026-10-21';
const scratch = '/private/tmp/roc-deflate-macos-gap';
const candidates = process.argv.slice(2);
const env = { ...process.env, DYLD_INSERT_LIBRARIES: `${work}/mimalloc/build/libmimalloc.dylib` };
const engines = [['C', `${work}/bin/cbench_raw`], ['baseline', `${work}/bin/ctime_raw`], ...candidates.map(p => [path.basename(p), p])];
const cases = (process.env.CASES || 'nci:2 nci:3 nci:4 mr:1 mr:2 xml:2 dickens:1 xml:4 reymont:1').split(' ').map(c => c.split(':'));
const reps = Number(process.env.REPS || 3), rounds = Number(process.env.ROUNDS || 3);
const median = a => { a = [...a].sort((a,b) => a-b); return (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)])/2; };
const rows = [];
for (const [file, level] of cases) {
  const groups = Object.fromEntries(engines.map(([e]) => [e, []]));
  for (let round = 1; round <= rounds; round++) {
    // Alternate the candidate order; retain C as the common output reference.
    const order = round % 2 ? engines : [engines[0], ...engines.slice(1).reverse()];
    let reference;
    for (const [engine, exe] of order) {
      const output = `${scratch}/compare-${engine}.deflate`;
      const text = execFileSync(exe, [`${work}/corpus/${file}`, level, String(reps), output], { env, encoding: 'utf8' });
      const bytes = fs.readFileSync(output);
      if (!reference) reference = bytes;
      else if (!bytes.equals(reference)) throw new Error(`${engine} L${level} ${file}: output mismatch`);
      const samples = text.split('\n').filter(l => l.startsWith('rep\t'));
      if (samples.length !== reps) throw new Error('Missing repetitions');
      for (const line of samples) {
        const [, rep, ns, size] = line.split('\t');
        groups[engine].push(Number(ns));
        rows.push([engine, level, file, round, Number(rep) + 1, ns, size]);
      }
    }
  }
  const med = Object.fromEntries(Object.entries(groups).map(([e,a]) => [e, median(a)]));
  console.log(`L${level} ${file}: ` + engines.slice(1).map(([e]) => `${e} vs C ${((med[e]/med.C-1)*100).toFixed(2)}%` + (e === 'baseline' ? '' : `; vs baseline ${((med[e]/med.baseline-1)*100).toFixed(2)}%`)).join(' | '));
}
const out = `${scratch}/${candidates.map(p => path.basename(p)).join('-')}-comparison.csv`;
fs.writeFileSync(out, 'engine,level,corpus,round,rep,ns,compressed_bytes\n' + rows.map(r => r.join(',')).join('\n') + '\n');
console.log(out);
