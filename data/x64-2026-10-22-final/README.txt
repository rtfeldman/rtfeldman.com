roc-deflate vs libdeflate compression throughput, Ryzen 9 3900X (Zen 2), Linux, 2026-10-22.

Versions
  roc compiler   roc-lang/roc d99c7b838f (main + #12507; #12507 is now merged)
  roc-deflate    rtfeldman/roc-deflate 04cb55f (niclas-ahden/roc-deflate#6)
  libdeflate     b122c8b
  mimalloc       v2.1.7 for both engines (LD_PRELOAD for libdeflate; linked into
                 the statically linked musl Roc harness, malloc verified == mi_malloc)

Method
  scripts/abp.sh: all 12 levels x 12 Silesia files, 7 reps per case, engines
  interleaved per case, each pinned to one core (taskset -c 6) because CCX and
  frequency effects moved unpinned results by +/-5 points. medians.txt holds the
  median MB/s per case; gaps.txt the per-case and per-level gaps.
  Output of every level is byte-identical to the reference (scripts/check.sh).
  L1 dickens is bimodal even pinned (+9% to +21% between passes).

Result
  worst case +18.0% (L10 x-ray, L3 x-ray), median +8.9%, roc faster in 16/144.

repro-deflate-mimalloc.sh rebuilds everything from scratch (unpinned, so its
numbers are not directly comparable to these).
