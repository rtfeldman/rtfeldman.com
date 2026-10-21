#!/usr/bin/env bash
# Reproduce the roc-deflate vs libdeflate compression timings: every level 1-12
# on all 12 Silesia files, libdeflate and roc-deflate interleaved, every timed
# repetition written to a CSV.
#
# usage: ./repro-deflate-mimalloc.sh [work-dir]     (default: ./roc-deflate-bench)
#
# Both engines must allocate through the same mimalloc for the comparison to
# mean anything. libdeflate's harness is a dynamically linked C program, so
# mimalloc is preloaded into it. On Linux the Roc harness is a statically
# linked musl executable (the basic-cli platform ships only musl hosts), which
# a preload cannot reach, so its objects are relinked with the same mimalloc
# version built for musl ahead of musl's own allocator, and the script checks
# that malloc and free resolve to mimalloc before timing anything. macOS
# executables are always dynamic, so there the preload covers both.
#
# Sources are pinned below and can be overridden: ROC_REPO/ROC_COMMIT for the
# compiler, ROC_DEFLATE_REPO/ROC_DEFLATE_REF for roc-deflate (a local path
# works for either). MIMALLOC_LIB names a prebuilt libmimalloc to preload
# instead of building one; on Linux it should be v2.1.7 to match the static
# build the Roc harness links.
#
# Needs: git, a C compiler (cc), curl, unzip, xz, python3, nm, and cmake (to
# build mimalloc). Zig 0.17.0 is used from PATH if it is that version,
# otherwise downloaded into the work dir. Linux x86_64/aarch64 or macOS. Run it
# on an otherwise idle machine; the timing pass takes roughly 30-60 minutes,
# the builds another 15-30.
set -euo pipefail

ROC_REPO=${ROC_REPO:-https://github.com/roc-lang/roc.git}
ROC_COMMIT=${ROC_COMMIT:-5e62c0e13a}          # roc-lang/roc#12501
LIBDEFLATE_COMMIT=b122c8b
ROC_DEFLATE_REPO=${ROC_DEFLATE_REPO:-https://github.com/rtfeldman/roc-deflate.git}
ROC_DEFLATE_REF=${ROC_DEFLATE_REF:-16578ed}   # niclas-ahden/roc-deflate#6
MIMALLOC_TAG=v2.1.7
ZIG_VERSION=0.17.0

WORK=$(mkdir -p "${1:-roc-deflate-bench}" && cd "${1:-roc-deflate-bench}" && pwd)
cd "$WORK"
log() { printf '\n== %s\n' "$*"; }

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) ZIG_TARGET=x86_64-linux; ROC_TARGET=x64musl ;;
  Linux-aarch64) ZIG_TARGET=aarch64-linux; ROC_TARGET=arm64musl ;;
  Darwin-arm64) ZIG_TARGET=aarch64-macos ;;
  Darwin-x86_64) ZIG_TARGET=x86_64-macos ;;
  *) echo "unsupported platform $(uname -s)-$(uname -m)"; exit 1 ;;
esac

for tool in git cc curl unzip xz python3 nm; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool"; exit 1; }
done

# --- Zig -------------------------------------------------------------------
if command -v zig >/dev/null && [ "$(zig version)" = "$ZIG_VERSION" ]; then
  ZIG=$(command -v zig)
else
  ZIG="$WORK/zig-$ZIG_TARGET-$ZIG_VERSION/zig"
  if [ ! -x "$ZIG" ]; then
    log "downloading zig $ZIG_VERSION"
    curl -fL "https://ziglang.org/download/$ZIG_VERSION/zig-$ZIG_TARGET-$ZIG_VERSION.tar.xz" | tar -xJ
  fi
fi
echo "zig: $ZIG ($("$ZIG" version))"

# --- Sources ---------------------------------------------------------------
fetch() { # fetch <dir> <url> <rev>
  [ -d "$1/.git" ] || git clone -q "$2" "$1"
  git -C "$1" fetch -q --tags origin
  git -C "$1" fetch -q origin "+refs/heads/*:refs/remotes/origin/*"
  rev=$3; git -C "$1" rev-parse -q --verify "origin/$3^{commit}" >/dev/null && rev=origin/$3
  git -C "$1" -c advice.detachedHead=false checkout -q --force "$rev"
}
log "fetching sources"
fetch roc "$ROC_REPO" "$ROC_COMMIT"
fetch libdeflate https://github.com/ebiggers/libdeflate.git "$LIBDEFLATE_COMMIT"
fetch roc-deflate "$ROC_DEFLATE_REPO" "$ROC_DEFLATE_REF"

# --- mimalloc (both engines run under it, so the allocator is not compared) --
# The source is always fetched: on Linux the Roc harness links a static build
# of it (see "Harnesses" below).
fetch mimalloc https://github.com/microsoft/mimalloc.git "$MIMALLOC_TAG"
MIMALLOC=${MIMALLOC_LIB:-}
if [ -z "$MIMALLOC" ]; then
  command -v cmake >/dev/null || { echo "cmake is needed to build mimalloc (or set MIMALLOC_LIB)"; exit 1; }
  log "building mimalloc $MIMALLOC_TAG"
  cmake -S mimalloc -B mimalloc/build -DCMAKE_BUILD_TYPE=Release -DMI_BUILD_TESTS=OFF >/dev/null
  cmake --build mimalloc/build -j >/dev/null 2>&1
  for lib in "$WORK"/mimalloc/build/libmimalloc.so "$WORK"/mimalloc/build/libmimalloc.dylib; do
    if [ -f "$lib" ]; then MIMALLOC=$lib; break; fi
  done
  [ -n "$MIMALLOC" ] || { echo "mimalloc build produced no library"; exit 1; }
fi
echo "mimalloc: $MIMALLOC"
if [ "$(uname -s)" = Darwin ]; then PRELOAD=DYLD_INSERT_LIBRARIES; else PRELOAD=LD_PRELOAD; fi

# --- Roc compiler ----------------------------------------------------------
ROC="$WORK/roc-install/bin/roc"
if [ ! -x "$ROC" ]; then
  log "building roc $ROC_COMMIT (ReleaseFast)"
  # Zig fetches the compiler's dependencies over the network; retry so one
  # dropped download does not end the run.
  for attempt in 1 2 3; do
    if (cd roc && "$ZIG" build roc -Doptimize=ReleaseFast --prefix "$WORK/roc-install"); then break; fi
    [ "$attempt" = 3 ] && { echo "roc build failed"; exit 1; }
    echo "roc build failed (attempt $attempt), retrying"; sleep 5
  done
fi
"$ROC" version

# --- Harnesses that print every repetition ---------------------------------
log "building harnesses"
python3 - "$WORK/roc-deflate/benchmark" <<'PY'
import sys
d = sys.argv[1]
c = open(f"{d}/cbench.c").read()
old = "        if (i == 0 || ns < best) best = ns;\n    }"
assert old in c, "cbench.c changed shape"
open(f"{d}/cbench_raw.c", "w").write(c.replace(old,
    "        if (i == 0 || ns < best) best = ns;\n"
    "        printf(\"rep\\t%d\\t%lld\\t%zu\\n\", i, ns, sz);\n    }"))
r = open(f"{d}/ctime.roc").read()
old = "\t\tdt = Monotonic.now!().since(t0).to_nanos().to_u128()\n"
assert old in r, "ctime.roc changed shape"
open(f"{d}/ctime_raw.roc", "w").write(r.replace(old, old +
    "\t\tStdout.line!(\"rep\\t${$r.to_str()}\\t${dt.to_str()}\\t${sz.to_str()}\") ? |_| Exit(10)\n"))
PY
mkdir -p bin
cc -O3 -I libdeflate -o bin/cbench_raw roc-deflate/benchmark/cbench_raw.c libdeflate/lib/*.c libdeflate/lib/*/*.c
# A fresh cache directory, so the build does not depend on earlier ones. The
# build keeps its intermediate objects, which Linux relinks below.
rm -rf "$WORK/roc-cache"
(cd roc-deflate && ROC_CACHE_DIR="$WORK/roc-cache" "$ROC" build --keep-temp --opt=speed benchmark/ctime_raw.roc --output="$WORK/bin/ctime_raw")

if [ "$(uname -s)" = Linux ]; then
  # Relink the Roc harness with mimalloc built for musl in front of musl's
  # libc.a, so its strong malloc/free/realloc/calloc/... replace musl's
  # allocator, keeping the platform's own link inputs and order otherwise
  # (basic-cli's targets: crt1.o, libhost.a, libunwind.a, the app, libc.a)
  # and the flags `roc build` links with.
  log "relinking the Roc harness with mimalloc"
  objs=$(ls -d "$WORK"/roc-cache/compat-*/tmp/*/ | head -1)
  app_objs=$(ls "$objs"roc_app_llvm_"$ROC_TARGET"_*.o "$objs"roc_static_data_"$ROC_TARGET".o)
  platform_hash=$(sed -n 's#.*pf: platform "[^"]*/\([A-Za-z0-9]*\)\.tar\.zst".*#\1#p' roc-deflate/benchmark/ctime_raw.roc)
  host="${XDG_CACHE_HOME:-$HOME/.cache}/roc/packages/$platform_hash/targets/$ROC_TARGET"
  for f in crt1.o libhost.a libunwind.a libc.a; do
    [ -f "$host/$f" ] || { echo "missing platform link input $host/$f"; exit 1; }
  done
  "$ZIG" cc -target "${ZIG_TARGET%-linux}-linux-musl" -mcpu=baseline -O3 -DNDEBUG \
    -DMI_MALLOC_OVERRIDE -DMI_LIBC_MUSL=1 -I mimalloc/include \
    -c mimalloc/src/static.c -o bin/mimalloc-musl.o
  segments=""; [ "$ROC_TARGET" = x64musl ] && segments="-z separate-loadable-segments"
  # shellcheck disable=SC2086
  "$ZIG" ld.lld -o bin/ctime_raw -nostdlib --gc-sections --build-id $segments -static \
    "$host/crt1.o" "$host/libhost.a" "$host/libunwind.a" $app_objs bin/mimalloc-musl.o "$host/libc.a"
  sym() { nm bin/ctime_raw | awk -v s="$1" '$3 == s {print $1}'; }
  if [ -z "$(sym mi_malloc)" ] || [ "$(sym malloc)" != "$(sym mi_malloc)" ] || [ "$(sym free)" != "$(sym mi_free)" ]; then
    echo "the relinked Roc harness does not allocate through mimalloc"; exit 1
  fi
  echo "Roc harness: malloc and free resolve to mimalloc"
fi

# --- Corpus ----------------------------------------------------------------
log "fetching the Silesia corpus"
CORPUS="$WORK/corpus"
(cd roc-deflate && ROC_CACHE_DIR="$WORK/roc-cache" "$ROC" benchmark/corpus.roc "$CORPUS")

# --- Timing ----------------------------------------------------------------
TSV="$WORK/raw.tsv"; : > "$TSV"
DIFFER="$WORK/differ.txt"; : > "$DIFFER"
FILES=${FILES:-"dickens mozilla mr nci ooffice osdb reymont samba sao webster x-ray xml"}
log "timing (started $(date +%H:%M))"
for L in ${LEVELS:-1 2 3 4 5 6 7 8 9 10 11 12}; do
  if [ "$L" -le 9 ]; then reps=5; rounds=3; else reps=3; rounds=2; fi
  for f in $FILES; do
    n=$(wc -c < "$CORPUS/$f" | tr -d ' ')
    for r in $(seq 1 "$rounds"); do
      env "$PRELOAD=$MIMALLOC" bin/cbench_raw "$CORPUS/$f" "$L" "$reps" "$WORK/c.deflate" |
        awk -v L="$L" -v f="$f" -v n="$n" -v r="$r" '$1=="rep" {print "libdeflate\t" L "\t" f "\t" n "\t" r "\t" $2+1 "\t" $3 "\t" $4}' >> "$TSV"
      env "$PRELOAD=$MIMALLOC" bin/ctime_raw "$CORPUS/$f" "$L" "$reps" "$WORK/r.deflate" |
        awk -v L="$L" -v f="$f" -v n="$n" -v r="$r" '$1=="rep" {print "roc-deflate\t" L "\t" f "\t" n "\t" r "\t" $2+1 "\t" $3 "\t" $4}' >> "$TSV"
      cmp -s "$WORK/c.deflate" "$WORK/r.deflate" || echo "L$L $f" >> "$DIFFER"
    done
  done
  echo "level $L done $(date +%H:%M)"
done

# --- Output ----------------------------------------------------------------
CSV="$WORK/roc-deflate-compression-timings.csv"
python3 - "$TSV" "$CSV" <<'PY'
import csv, sys, collections, statistics
rows = [l.rstrip("\n").split("\t") for l in open(sys.argv[1]) if l.strip()]
with open(sys.argv[2], "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["engine", "level", "corpus", "input_bytes", "round", "rep", "ns", "mb_per_s", "compressed_bytes"])
    for e, L, c, n, r, rep, ns, sz in rows:
        w.writerow([e, L, c, n, r, rep, ns, f"{int(n) / int(ns) * 1000:.2f}", sz])
g = collections.defaultdict(list)
for e, L, c, n, r, rep, ns, sz in rows:
    g[(int(L), c, e)].append(int(n) / int(ns) * 1000)
corpora = sorted({k[1] for k in g})
print("level  libdeflate  roc-deflate  median gap (libdeflate faster by)")
for L in sorted({k[0] for k in g}):
    lib = [statistics.median(g[(L, c, "libdeflate")]) for c in corpora]
    roc = [statistics.median(g[(L, c, "roc-deflate")]) for c in corpora]
    gap = [(a / b - 1) * 100 for a, b in zip(lib, roc)]
    print(f"{L:5d}  {statistics.median(lib):10.1f}  {statistics.median(roc):11.1f}  {statistics.median(gap):+6.1f}%")
PY
if [ -s "$DIFFER" ]; then echo "WARNING: outputs differed from libdeflate's for:"; cat "$DIFFER"; else echo "all outputs byte-identical to libdeflate's"; fi
echo "CSV: $CSV"
