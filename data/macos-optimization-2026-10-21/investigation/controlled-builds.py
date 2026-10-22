from pathlib import Path
import subprocess,os,json,hashlib
scratch=Path('/private/tmp/roc-deflate-macos-investigate')
repo=Path('/Users/rtfeldman/code/worktrees/roc-deflate/macos-deflate-gap/roc-deflate')
src=scratch/'controlled-src';src.mkdir(exist_ok=True)
archive=subprocess.check_output(['git','-C',str(repo),'archive','16578ed'])
subprocess.run(['tar','-x','-C',str(src)],input=archive,check=True)
(src/'benchmark/ctime_raw.roc').write_bytes(Path('/private/tmp/roc-deflate-macos-optimized-2026-10-21/roc-deflate/benchmark/ctime_raw.roc').read_bytes())
manifest=[]
for candidate,ref,fast_only in [('control-reference-a','16578ed',False),('control-reference-b','16578ed',False),('control-fast-only','16578ed',True),('control-first-opt','2dbe9a2',False)]:
 for name in ['CompressFast','CompressLazy','HcMatchfinder']:
  commit='2dbe9a2' if fast_only and name=='CompressFast' else ref
  (src/f'package/{name}.roc').write_bytes(subprocess.check_output(['git','-C',str(repo),'show',f'{commit}:package/{name}.roc']))
 env={**os.environ,'ROC_CACHE_DIR':str(scratch/('cache-'+candidate))}
 cmd=['/private/tmp/roc-deflate-macos-2026-10-21/roc-install/bin/roc','build','--no-cache','--keep-temp','--opt=speed','benchmark/ctime_raw.roc','--output=/private/tmp/roc-deflate-macos-gap/'+candidate]
 with (scratch/(candidate+'-build.log')).open('w') as log:subprocess.run(cmd,cwd=src,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
 manifest.append({'candidate':candidate,'source_reference':ref,'only_level1_delta':fast_only,'command':cmd,'source_directory':str(src),'executable_sha256':hashlib.sha256(Path('/private/tmp/roc-deflate-macos-gap/'+candidate).read_bytes()).hexdigest()})
 print('built',candidate,flush=True)
(scratch/'controlled-build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
