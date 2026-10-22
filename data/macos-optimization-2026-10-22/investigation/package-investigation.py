from pathlib import Path
import csv,hashlib,json,shutil,tarfile
s=Path('/private/tmp/roc-gap-2026-10-22')
out=Path('/Users/rtfeldman/code/worktrees/rtfeldman.com/glad-mill/rtfeldman.com/data/macos-optimization-2026-10-22/investigation');out.mkdir(exist_ok=True)
panels={
 'wide':'guard-batch-hcwide-allwide',
 'batching':'guard-batch-guard-d99-smallbias-batch2-batch4-vector4-linear-earlyload-vector2',
 'greedy':'guard-d99-split-greedy-greedy-v0-greedy-v8-greedy-v16-greedy-fast-v',
 'fresh-process':'case-29bd-case-d99-case-split-case-pair-case-both',
 'prefetch':'prefetch-base-no-prefetch',
 'lazy':'lazy-base-lazy-split',
 'lazy-followup':'lazy-base-lazy-split-lazy-only',
 'walk':'lazy-base-walk-base-walk-all-walk-all-vector',
 'optimal':'bt-base-bt-direct-bt-unpacked-bt-both-bt-indexed-fixed',
 'fast-distance':'walk-all-fast-base-fast-arithmetic',
 'integration-layout':'walk-all-fast-base-layout-packed-tables-packed-tables-unpacked',
}
manifest={};builds=set();rawdirs=[]
for label,name in panels.items():
 p=s/(name+'-comparison.csv');rows=list(csv.DictReader(p.open()))
 meta=json.loads(p.with_suffix('.run.json').read_text());assert meta.get('finished')
 engines=sorted({r['engine'] for r in rows});builds.update(e for e in engines if e!='C')
 d=out/label;d.mkdir(exist_ok=True)
 for ext in ['.csv','.summary.csv','.run.json']:shutil.copyfile(p.with_suffix(ext),d/('comparison'+ext))
 manifest[label]=dict(original_label=name,driver_protocol=meta.get('driver_protocol','per-file-batch-v1'),samples=len(rows),rounds=meta['rounds'],engines=engines,corpora=sorted({r['corpus'] for r in rows}),levels=sorted({int(r['level']) for r in rows}),csv_sha256=hashlib.sha256(p.read_bytes()).hexdigest())
 raw=s/(name+'-raw')
 if raw.exists():rawdirs.append((raw,label))
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'builds').mkdir(exist_ok=True)
for name in sorted(builds):shutil.copyfile(s/name/'build.json',out/'builds'/(name+'.json'))
with tarfile.open(out/'raw-output.tar.gz','w:gz') as tar:
 for raw,label in rawdirs:tar.add(raw,arcname=label)
with tarfile.open(out/'experiment-sources.tar.gz','w:gz') as tar:
 tar.add(s/'variants',arcname='variants')
 for source in s.glob('*-source'):
  if source.is_dir():tar.add(source,arcname='snapshots/'+source.name)
 for pattern in ['make-*.py','build-*.py','compare*.py','panel-stats.py']:
  for p in s.glob(pattern):tar.add(p,arcname='scripts/'+p.name)
for name in ['case-statistics','prefetch-statistics','greedy-statistics','batched-statistics','lazy-statistics','lazy-followup-statistics','walk-statistics','bt-statistics','fast-statistics','layout-statistics']:
 p=s/(name+'.json')
 if p.exists():shutil.copyfile(p,out/p.name)
print('Packaged',len(panels),'completed exploratory panels and',len(builds),'build manifests.')
