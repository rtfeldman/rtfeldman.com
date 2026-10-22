app [main!] {
 pf: platform "../../../main.roc",
 deflate: "../../../../../package/main.roc",
}
import Bench
import "../../../../../../../../../../../../private/tmp/roc-deflate-macos-2026-10-21/corpus/reymont" as input : List(U8)
import "level-1.deflate" as ref1 : List(U8)
import "level-2.deflate" as ref2 : List(U8)
import "level-3.deflate" as ref3 : List(U8)
import "level-4.deflate" as ref4 : List(U8)
import "level-5.deflate" as ref5 : List(U8)
import "level-6.deflate" as ref6 : List(U8)
import "level-7.deflate" as ref7 : List(U8)
import "level-8.deflate" as ref8 : List(U8)
import "level-9.deflate" as ref9 : List(U8)
import "level-10.deflate" as ref10 : List(U8)
import "level-11.deflate" as ref11 : List(U8)
import "level-12.deflate" as ref12 : List(U8)
main! = |level_number| Bench.run!(input, [{ level: 1, expected: ref1 }, { level: 2, expected: ref2 }, { level: 3, expected: ref3 }, { level: 4, expected: ref4 }, { level: 5, expected: ref5 }, { level: 6, expected: ref6 }, { level: 7, expected: ref7 }, { level: 8, expected: ref8 }, { level: 9, expected: ref9 }, { level: 10, expected: ref10 }, { level: 11, expected: ref11 }, { level: 12, expected: ref12 }], 5, level_number)
