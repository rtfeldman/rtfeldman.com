"""Retain source provenance and successful validation beside imported final data."""
from pathlib import Path
import hashlib,json,shutil,subprocess
s=Path('/private/tmp/roc-gap-2026-10-22')
blog=Path('/Users/rtfeldman/code/worktrees/rtfeldman.com/glad-mill/rtfeldman.com/data')
repo=Path('/Users/rtfeldman/code/worktrees/roc-deflate/macos-deflate-gap/roc-deflate')
after=blog/'macos-optimization-2026-10-22';before=blog/'macos-before-2026-10-22'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert json.loads((after/'build.json').read_text())['library']==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
for label,out,commit in [('final-before',before,'56998d3'),('final-after',after,head)]:
 meta=json.loads((out/'build.json').read_text())
 compiler=meta['roc_version'].split('-')[-1]
 compiler_repo='/private/tmp/roc-deflate-compiler-latest-2026-10-22'
 compiler_commit=subprocess.check_output(['git','rev-parse',compiler],cwd=compiler_repo,text=True).strip()
 commit=subprocess.check_output(['git','rev-parse',commit],cwd=repo,text=True).strip()
 provenance=dict(library_pr='https://github.com/rtfeldman/roc-deflate/pull/11',library_commit=commit,compiler_commit=compiler_commit,compiler_sha256=meta['roc_sha256'],libdeflate_commit=meta['libdeflate'],mimalloc_commit='8c532c32c3c96e5ba1f2283e032f69ead8add00f',harness_commit=head,driver_protocol=meta['driver_protocol'],warmup_min_ns=meta['warmup_min_ns'],cpu=meta['cpu'],os=meta['system'],memory_bytes=34359738368,physical_cores=10,power='AC',measurement='3 rounds x 5 repetitions x 144 cases; fresh process for each engine/file/level; common C measurements',compiler_flags='--no-cache --opt=speed',c_flags='-O3 -DMI_STATIC_LIB',source_version_note='Before package overlaid exactly from 56998d3 while retaining the final platform; package hashes verified against git.' if label=='final-before' else 'Clean committed final package. All timed outputs checked against exact libdeflate bytes.')
 (out/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
 drivers=out/'drivers';drivers.mkdir(exist_ok=True)
 for file in meta['files']:
  d=drivers/file;d.mkdir(exist_ok=True)
  for f in ['cbench.c','input.s','app.roc','Bench.roc']:shutil.copyfile(s/label/file/f,d/f)
 shutil.copyfile(s/(label+'-build.log'),out/'build.log')
checks=after/'validation';checks.mkdir(exist_ok=True)
for name in ['final-unit','final-platform','final-interop-build','final-interop-results','final-ratios-build','final-ratios-results','compiler-d99-tests','platform-case-old-tests']:
 shutil.copyfile(s/(name+'.log'),checks/(name+'.log'))
for f in ['build-final.py','package-final-data.py']:shutil.copyfile(s/f,after/f)
shutil.copyfile(s/'analyze-embedded-benchmarks.mjs',blog/'analyze-embedded-benchmarks.mjs')
subprocess.run(['git','bundle','create',str(after/'roc-deflate.bundle'),'macos-deflate-gap'],cwd=repo,check=True)
for base,name in [('56998d3','library-from-before.patch'),('04cb55f','library-from-upstream-pr6.patch')]:
 (after/name).write_bytes(subprocess.check_output(['git','diff',base,head,'--','package','benchmark/echo-clock'],cwd=repo))
subprocess.run(['git','archive','--format=tar.gz','--output='+str(after/'final-sources.tar.gz'),head,'package','benchmark/echo-clock','benchmark/cbench.c'],cwd=repo,check=True)
print('Packaged final source provenance and validation logs.')
