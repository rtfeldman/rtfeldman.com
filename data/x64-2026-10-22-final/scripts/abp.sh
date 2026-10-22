#!/usr/bin/env bash
# ab.sh "<levels>" "<files>" reps bin1 bin2 ... : interleaved, median MB/s per binary (cbench_raw allowed as a bin)
B=~/code/deflate-bench; LEVELS=$1; FILES=${2:-"dickens mozilla mr nci ooffice osdb reymont samba sao webster x-ray xml"}; REPS=$3; shift 3
export LD_PRELOAD=$B/mimalloc/build/libmimalloc.so
for L in $LEVELS; do for f in $FILES; do
  n=$(stat -c %s $B/corpus/$f); line="L$L $f"
  for bin in "$@"; do
    m=$(taskset -c 6 $bin $B/corpus/$f $L $REPS /tmp/claude-1000/ab.out | awk '$1=="rep"{print $3}' | sort -n | awk '{a[NR]=$1} END{print a[int((NR+1)/2)]}')
    line="$line $(basename $bin)=$(python3 -c "print(f'{$n/$m*1000:.1f}')")"
  done
  echo "$line"
done; done
