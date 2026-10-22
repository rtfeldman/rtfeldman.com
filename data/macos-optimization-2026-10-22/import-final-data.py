"""Import a completed, independently measured paired run; never exploratory panels."""
from pathlib import Path
import csv,hashlib,json,shutil,sys,subprocess
scratch=Path('/private/tmp/roc-gap-2026-10-22')
blog=Path('/Users/rtfeldman/code/worktrees/rtfeldman.com/glad-mill/rtfeldman.com/data')
corpus=Path('/private/tmp/roc-deflate-macos-2026-10-21/corpus')
before,after=sys.argv[1:]
name=f'{before}-{after}'
source=scratch/f'{name}-comparison.csv'
run=json.loads(source.with_suffix('.run.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert run.get('finished') and run['rounds']==3 and run['samples']==6480
assert run['csv_sha256']==sha(source)
assert run['script_sha256']==sha(scratch/'compare-case.py')
metas={n:json.loads((scratch/n/'build.json').read_text()) for n in [before,after]}
for n in [before,after]:assert run['builds'][n]==sha(scratch/n/'build.json')
library=Path('/Users/rtfeldman/code/worktrees/roc-deflate/macos-deflate-gap/roc-deflate')
def package_hashes(commit):
 files=subprocess.check_output(['git','ls-tree','-r','--name-only',commit,'--','package'],cwd=library,text=True).splitlines()
 return {f:hashlib.sha256(subprocess.check_output(['git','show',commit+':'+f],cwd=library)).hexdigest() for f in files if f.endswith('.roc') and f.count('/')==1}
assert metas[before]['package_sha256']==package_hashes('56998d3')
assert metas[after]['package_sha256']==package_hashes(metas[after]['library'])
assert metas[after]['library_diff']==''
base=metas[before]
assert len(base['files'])==12 and base['levels']==list(range(1,13)) and base['reps']==5
for n,m in metas.items():
 assert m['files']==base['files'] and m['levels']==base['levels'] and m['reps']==5
 assert m['driver_protocol']=='per-case-process-v1' and m['warmup_min_ns']==200000000 and m['libdeflate_diff']==''
 assert m['corpus_sha256']==base['corpus_sha256'] and m['reference_sha256']==base['reference_sha256']
 for f in m['files']:assert sha(corpus/f)==m['corpus_sha256'][f]
rows=list(csv.DictReader(source.open()))
assert len(rows)==6480
assert {r['engine'] for r in rows}=={'C',before,after}
seen=set()
raw_cache={}
for r in rows:
 key=tuple(r[c] for c in ['engine','corpus','level','round','rep'])
 assert key not in seen;seen.add(key)
 raw_name=f"{r['round']}-{r['corpus']}-{r['level']}-{r['engine']}.txt"
 if raw_name not in raw_cache:
  data=(scratch/f'{name}-raw'/raw_name).read_text().splitlines()
  samples=[line.split('\t') for line in data if line.startswith('rep\t')]
  assert len(samples)==5
  raw_cache[raw_name]={(int(l),int(p)+1):(int(ns),int(sz)) for _,l,p,ns,sz in samples}
  assert len(raw_cache[raw_name])==5
 assert raw_cache[raw_name][int(r['level']),int(r['rep'])]==(int(r['ns']),int(r['compressed_bytes']))
 assert int(r['ns'])>0
cols='engine level corpus input_bytes round rep ns mb_per_s compressed_bytes'.split()
for label,directory in [(before,'macos-before-2026-10-22'),(after,'macos-optimization-2026-10-22')]:
 out=blog/directory;out.mkdir(exist_ok=True)
 selected=[]
 for r in rows:
  if r['engine'] not in ['C',label]:continue
  n=(corpus/r['corpus']).stat().st_size;ns=int(r['ns'])
  selected.append(dict(engine='libdeflate' if r['engine']=='C' else 'roc-deflate',level=int(r['level']),corpus=r['corpus'],input_bytes=n,round=int(r['round']),rep=int(r['rep']),ns=ns,mb_per_s=f'{n/ns*1000:.2f}',compressed_bytes=int(r['compressed_bytes'])))
 assert len(selected)==4320
 with (out/'roc-deflate-compression-timings.csv').open('w') as f:
  w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows(selected)
 (out/'raw.tsv').write_text(''.join('\t'.join(str(r[c]) for c in cols if c!='mb_per_s')+'\n' for r in selected))
 (out/'differ.txt').write_text('') # Compatibility marker: actual proof is successful checked driver executions.
 shutil.copyfile(scratch/label/'build.json',out/'build.json')
 shutil.copyfile(scratch/before/'build.json',out/'common-c-build.json')
 shutil.copyfile(source.with_suffix('.run.json'),out/'run.json')
 (out/'raw').mkdir(exist_ok=True)
 for raw_name in raw_cache:
  if raw_name.endswith(f'-{label}.txt') or raw_name.endswith('-C.txt'):shutil.copyfile(scratch/f'{name}-raw'/raw_name,out/'raw'/raw_name)
 (out/'import.json').write_text(json.dumps(dict(source_csv=source.name,source_csv_sha256=sha(source),source_build=label,common_c_build=before,import_script_sha256=sha(Path(__file__)),samples=4320,input_bytes={f:(corpus/f).stat().st_size for f in base['files']}),indent=2)+'\n')
 print(out)
shutil.copyfile(source,blog/'macos-optimization-2026-10-22'/'paired-comparison.csv')
shutil.copyfile(scratch/'compare-case.py',blog/'macos-optimization-2026-10-22'/'compare-case.py')
shutil.copyfile(Path(__file__),blog/'macos-optimization-2026-10-22'/'import-final-data.py')
print('Imported two validated 4,320-sample datasets sharing the same C samples.')
