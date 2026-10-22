"""Freeze and validate the final source, then build paired benchmark drivers."""
from pathlib import Path
import hashlib,json,os,subprocess,sys
root=Path('/Users/rtfeldman/code/worktrees/roc-deflate/macos-deflate-gap/roc-deflate')
s=Path('/private/tmp/roc-gap-2026-10-22')
old='/private/tmp/roc-deflate-macos-2026-10-21/roc-install/bin/roc'
roc=sys.argv[1]
assert not subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip(), 'Commit final sources first'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
def run_log(name,cmd,env=None):
 print('start',name,flush=True)
 with (s/(name+'.log')).open('w') as log:subprocess.run([str(x) for x in cmd],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
 print('passed',name,flush=True)
run_log('final-unit',[roc,'test','package/main.roc'])
env=dict(os.environ,ROC=roc)
run_log('final-platform',['benchmark/echo-clock/test.sh'],env)
run_log('final-interop-build',[roc,'build','--no-cache','--opt=speed','tests/harness.roc','--output='+str(s/'final-interop')])
env=dict(os.environ,PATH='/private/tmp/roc-deflate-macos-gap/libdeflate-cli/programs:'+os.environ['PATH'])
run_log('final-interop-results',[s/'final-interop'],env)
run_log('final-ratios-build',[roc,'build','--no-cache','--opt=speed','tests/ratios.roc','--output='+str(s/'final-ratios')])
run_log('final-ratios-results',[s/'final-ratios'])
saved={p.name:p.read_bytes() for p in (root/'package').glob('*.roc')}
files=subprocess.check_output(['git','ls-tree','-r','--name-only','56998d3','--','package'],cwd=root,text=True).splitlines()
baseline={Path(f).name:subprocess.check_output(['git','show','56998d3:'+f],cwd=root) for f in files if f.endswith('.roc') and f.count('/')==1}
def replace_package(contents):
 for p in (root/'package').glob('*.roc'):p.unlink()
 for name,data in contents.items():(root/'package'/name).write_bytes(data)
try:
 for name,compiler,source in [('final-before',old,baseline),('final-after',roc,saved)]:
  replace_package(source)
  run_log(name+'-build',['python3','benchmark/echo-clock/measure.py','build','--roc',compiler,'--corpus','/private/tmp/roc-deflate-macos-2026-10-21/corpus','--libdeflate','/private/tmp/roc-deflate-macos-2026-10-21/libdeflate','--out',s/name,'--reps','5'])
finally:replace_package(saved)
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip()
print('Final validation and both builds complete; no measurements have started.',flush=True)
