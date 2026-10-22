#!/usr/bin/env bash
# check.sh <roc-bin> "<levels>" : byte-identity vs libdeflate on all files
B=~/code/deflate-bench; T=/tmp/claude-1000/chk; mkdir -p $T
fail=0
for L in $2; do for f in dickens mozilla mr nci ooffice osdb reymont samba sao webster x-ray xml; do
  [ -f $T/c.$L.$f ] || $B/bin/cbench_raw $B/corpus/$f $L 1 $T/c.$L.$f >/dev/null
  $1 $B/corpus/$f $L 1 $T/r.$L.$f >/dev/null || { echo "RUN FAIL L$L $f"; fail=1; }
  cmp -s $T/c.$L.$f $T/r.$L.$f || { echo "DIFF L$L $f"; fail=1; }
done; done
[ $fail = 0 ] && echo "identical: levels $2"
