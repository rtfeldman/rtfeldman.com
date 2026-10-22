"""Compare preserved builds with balanced engine order and exact sample validation."""
import csv, hashlib, json, os, pathlib, statistics, subprocess, sys, time
root = pathlib.Path(os.environ.get('ROC_BENCH_ROOT', '/private/tmp/roc-gap-2026-10-22'))
names = sys.argv[1:]
assert names and len(names) == len(set(names))
metas = {n: json.loads((root/n/'build.json').read_text()) for n in names}
base = metas[names[0]]
assert all(m['driver_protocol']=='per-case-process-v1' and m['warmup_min_ns']==200000000 for m in metas.values())
assert all(m['files'] == base['files'] and m['levels'] == base['levels'] and m['reps'] == base['reps'] for m in metas.values())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
for n,m in metas.items():
    assert m['corpus_sha256'] == base['corpus_sha256']
    for file in base['files']:
        for engine in ['cbench','rocbench']:
            assert sha(root/n/file/engine) == m['executable_sha256'][file][engine]
        for level in base['levels']:
            assert sha(root/n/file/f'level-{level}.deflate') == sha(root/names[0]/file/f'level-{level}.deflate')
rounds = int(os.environ.get('ROUNDS', '3'))
assert rounds > 0
label = '-'.join(names)
out = root/(label+'-comparison.csv')
raw = root/(label+'-raw'); raw.mkdir(exist_ok=True)
metadata = dict(driver_protocol='per-case-process-v1', started=time.strftime('%Y-%m-%dT%H:%M:%S%z'), rounds=rounds,
    builds={n:sha(root/n/'build.json') for n in names},
    order='Rotate [C, baseline, candidate, ...] left by round-1',
    script_sha256=sha(pathlib.Path(__file__)))
meta_path = out.with_suffix('.run.json')
meta_path.write_text(json.dumps(metadata,indent=2)+'\n')
env = {k:v for k,v in os.environ.items() if k not in ('DYLD_INSERT_LIBRARIES','LD_PRELOAD')}
rows=[]; seen=set()
with out.open('w') as f:
    w=csv.writer(f); w.writerow(['engine','corpus','level','round','rep','ns','compressed_bytes'])
    for r in range(1,rounds+1):
        engines=['C',*names]; shift=(r-1)%len(engines); engines=engines[shift:]+engines[:shift]
        for file in base['files']:
            for selected_level in base['levels']:
                for engine in engines:
                    d=root/(names[0] if engine=='C' else engine)/file
                    print('start',r,file,selected_level,engine,time.strftime('%H:%M:%S'),flush=True)
                    cmd=[d/'cbench','embedded',str(selected_level),str(base['reps'])] if engine=='C' else [d/'rocbench',str(selected_level)]
                    output=subprocess.check_output(cmd,text=True,env=env)
                    (raw/f'{r}-{file}-{selected_level}-{engine}.txt').write_text(output)
                    samples=[line.split('\t') for line in output.splitlines() if line.startswith('rep\t')]
                    expected={(selected_level,p) for p in range(base['reps'])}
                    assert len(samples)==len(expected)
                    assert {(int(s[1]),int(s[2])) for s in samples}==expected
                    for _,l,p,ns,size in samples:
                        l,p,ns,size=map(int,[l,p,ns,size]); key=(engine,file,l,r,p)
                        assert key not in seen and ns>0
                        assert size==(d/f'level-{l}.deflate').stat().st_size
                        seen.add(key);row=[engine,file,l,r,p+1,ns,size]
                        rows.append(row);w.writerow(row)
                    f.flush()
            print('done',r,file,time.strftime('%H:%M:%S'),flush=True)
assert len(rows)==(1+len(names))*len(base['files'])*len(base['levels'])*rounds*base['reps']
metadata.update(finished=time.strftime('%Y-%m-%dT%H:%M:%S%z'),samples=len(rows),csv_sha256=sha(out))
meta_path.write_text(json.dumps(metadata,indent=2)+'\n')
groups={}
for e,c,l,r,p,ns,size in rows: groups.setdefault((c,l,e),[]).append(ns)
result=[]
for c,l in sorted({(r[1],r[2]) for r in rows}):
    ctime=statistics.median(groups[c,l,'C'])
    gaps={e:100*(statistics.median(groups[c,l,e])/ctime-1) for e in names}
    result.append([c,l,*[gaps[e] for e in names]])
    print(c,l,' | '.join(f'{e} {gaps[e]:+.2f}%' for e in names))
with out.with_suffix('.summary.csv').open('w') as f:
    w=csv.writer(f);w.writerow(['corpus','level',*names]);w.writerows(result)
print(out)
