#!/usr/bin/env bash
# Reproduce the roc-deflate 0.4.0 vs libdeflate compression timings: every
# level 1-12 on all 12 Silesia files, libdeflate and roc-deflate interleaved,
# every timed repetition written to a CSV.
#
# usage: ./bench-roc-deflate-0.4.sh [work-dir]     (default: ./roc-deflate-bench)
#
# Needs: git, a C compiler (cc), curl, unzip, xz, python3, and either an
# installed mimalloc (libmimalloc.so) or cmake to build one. Zig 0.17.0 is used
# from PATH if it is that version, otherwise downloaded into the work dir.
# Linux x86_64 or macOS. Run it on an otherwise idle machine; the timing pass
# takes roughly 30-60 minutes, the builds another 15-30.
set -euo pipefail

ROC_COMMIT=319cdae7c1           # roc main with PRs #12378 and #12387
LIBDEFLATE_COMMIT=b122c8b
ROC_DEFLATE_TAG=0.4.0
ZIG_VERSION=0.17.0

WORK=$(mkdir -p "${1:-roc-deflate-bench}" && cd "${1:-roc-deflate-bench}" && pwd)
cd "$WORK"
log() { printf '\n== %s\n' "$*"; }

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) ZIG_TARGET=x86_64-linux ;;
  Linux-aarch64) ZIG_TARGET=aarch64-linux ;;
  Darwin-arm64) ZIG_TARGET=aarch64-macos ;;
  Darwin-x86_64) ZIG_TARGET=x86_64-macos ;;
  *) echo "unsupported platform $(uname -s)-$(uname -m)"; exit 1 ;;
esac

for tool in git cc curl unzip xz python3; do
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
  git -C "$1" -c advice.detachedHead=false checkout -q --force "$3"
}
log "fetching sources"
fetch roc https://github.com/roc-lang/roc.git "$ROC_COMMIT"
fetch libdeflate https://github.com/ebiggers/libdeflate.git "$LIBDEFLATE_COMMIT"
fetch roc-deflate https://github.com/niclas-ahden/roc-deflate.git "$ROC_DEFLATE_TAG"

# --- mimalloc (both engines run under it, so the allocator is not compared) --
MIMALLOC=${MIMALLOC_LIB:-}
if [ -z "$MIMALLOC" ]; then
  if [ "$(uname -s)" = Darwin ]; then
    MIMALLOC=$(brew --prefix mimalloc 2>/dev/null || true)/lib/libmimalloc.dylib
  else
    MIMALLOC=$( (ldconfig -p 2>/dev/null || true) | awk '/libmimalloc\.so/ && !found {print $NF; found=1}')
  fi
fi
if [ -z "$MIMALLOC" ] || [ ! -f "$MIMALLOC" ]; then
  command -v cmake >/dev/null || { echo "no mimalloc found and no cmake to build one (set MIMALLOC_LIB)"; exit 1; }
  log "building mimalloc"
  fetch mimalloc https://github.com/microsoft/mimalloc.git v2.1.7
  cmake -S mimalloc -B mimalloc/build -DCMAKE_BUILD_TYPE=Release -DMI_BUILD_TESTS=OFF >/dev/null
  cmake --build mimalloc/build -j >/dev/null 2>&1
  for lib in "$WORK"/mimalloc/build/libmimalloc.so "$WORK"/mimalloc/build/libmimalloc.dylib; do
    if [ -f "$lib" ]; then MIMALLOC=$lib; break; fi
  done
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
# A fresh cache directory, so the build does not depend on earlier ones.
rm -rf "$WORK/roc-cache"
(cd roc-deflate && ROC_CACHE_DIR="$WORK/roc-cache" "$ROC" build --opt=speed benchmark/ctime_raw.roc --output="$WORK/bin/ctime_raw")

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
CSV="$WORK/roc-deflate-0.4-compression-timings.csv"
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
