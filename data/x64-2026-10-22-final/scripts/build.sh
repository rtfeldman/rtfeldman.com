#!/usr/bin/env bash
# build.sh <roc-bin> <out-name>: build the Roc timing harness and relink it with
# mimalloc (as repro-deflate-mimalloc.sh does), failing unless malloc/free
# resolve to mimalloc.
set -euo pipefail
B=~/code/deflate-bench
OUT=$2
C=$(mktemp -d /tmp/claude-1000/rocbuild.XXXX)
cd /home/rtfeldman/code/roc-deflate
ROC_CACHE_DIR=$C "$1" build --keep-temp --opt=speed benchmark/ctime_raw.roc --output=$B/bin/$2 2>&1 | grep -E 'error|warning|successfully' | head -3
objs=$(ls -d "$C"/compat-*/tmp/*/ | head -1)
host=$HOME/.cache/roc/packages/Gj3zVDr3qrQa6aTh7Z1zgUfe9NeBE6R76T5ho3xrc8af/targets/x64musl
zig ld.lld -o $B/bin/$2 -nostdlib --gc-sections --build-id -z separate-loadable-segments -static \
  $host/crt1.o $host/libhost.a $host/libunwind.a "$objs"roc_app_llvm_x64musl_*.o "$objs"roc_static_data_x64musl.o $B/bin/mimalloc-musl.o $host/libc.a
sym() { nm $B/bin/$OUT | awk -v s="$1" '$3 == s {print $1}'; }
[ -n "$(sym mi_malloc)" ] && [ "$(sym malloc)" = "$(sym mi_malloc)" ] && [ "$(sym free)" = "$(sym mi_free)" ] || { echo "not linked with mimalloc"; exit 1; }
rm -rf "$C"
echo "built $2 (mimalloc)"
