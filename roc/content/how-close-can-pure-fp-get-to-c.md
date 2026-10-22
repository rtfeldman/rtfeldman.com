# How close can pure FP get to C?

*October 22, 2026*

In [Why Lean is Faster Than Rust](https://kim-em.github.io/blog/2026-7-24-why-lean-is-faster-than-rust/), the author shares an impressive result: a [DEFLATE compression](https://en.wikipedia.org/wiki/Deflate) library written in [Lean 4](https://github.com/leanprover/lean4), a functional programming language and proof assistant, outperforming an equivalent Rust package that [crates.io says](https://crates.io/search?q=miniz_oxide) has been downloaded _over a billion times._ From the article:

> `lean-zip` beats every single compression level `miniz_oxide` provides, i.e. we're capable of providing the same compression at higher throughput. At its fastest setting we're 15% quicker and the output is 8.8% smaller.

However, the article also notes that while they managed to surpass Rust's `miniz_oxide`, they were no match for the end boss of DEFLATE performance: [libdeflate](https://github.com/ebiggers/libdeflate), written in C.

> `lean-zip` is certainly not the best here: `libdeflate` unsurprisingly blows it out of the water (unsurprisingly because this is a very carefully tuned implementation using architecture-specific SIMD, that we can't touch in Lean).

Enter [Roc](https://roc-lang.org), a functional programming language (but not a theorem prover) with an explicit focus on runtime performance.

Roc's tagline is "Fast, Friendly, Functional," and [Fast comes first](https://roc-lang.org/fast) because both running fast _and_ compiling fast have always been central goals. Roc is not a mature language (it's still weeks away from its first numbered release, 0.1.0), and its nascent package ecosystem has had almost no optimization work done on it. Still, between its language design, [longstanding optimizations](https://youtu.be/vzfy4EKwG_Y?si=oYa6k2pFdsRJcQW7), and [brand-new compiler implementation](https://rtfeldman.com/rust-to-zig), I figured Roc already had enough of a foundation in place to take on the champ: libdeflate.

So I spent a bunch of time grinding through performance optimizations on [roc-deflate](https://github.com/niclas-ahden/roc-deflate), a package [Niclas Ahden](https://www.youtube.com/@NiclasAhden) wrote (and [uses in paid production work](https://youtu.be/12yVcgQHAK0?si=JETe6lec5y4jCLVL)) for DEFLATE compression. I didn't expect to beat libdeflate's performance across the board like `lean-zip` did with `miniz_oxide`, but I wanted to see how close it could get on the non-streaming APIs (as roc-deflate hasn't implemented streaming yet), using the classic Silesia corpus for benchmarking and verifying that it produced identical outputs.

## Under 10% Slower

Here's where the benchmarks stand today, running on the 2021 M1 MacBook Pro where I did all the optimization work, as well as on an AMD Ryzen 9 3900X Ubuntu machine for an x64 comparison.

[graph goes here]

roc-deflate ran these 144 benchmarks slower on average than libdeflate, in the median case **8.9%** slower on the Ryzen 3900X, and **2.6%** on the M1 MacBook Pro.

So while we didn't outperform the champ on average, a median slowdown percentage in the single digits compared to such a carefully-tuned SIMD-powered C library is _wild._ It's frankly not a result I knew was achievable going in, since Roc is a functional language with automatic memory management racing against code that doesn't have to do bounds checks. (Bounds checks have a cost, but then again, the last time a skipped bounds check in C compression code led to a major Remote Code Execution vulnerability [was yesterday](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases#nodejs-brotli-decoder-out-of-bounds-write-permits-remote-code-execution-cve-2026-111497---high).)

The graph shows more detail than just the median gap. On the worst-case inputs, roc-deflate was 18% slower than libdeflate, but on the best-case inputs, roc-deflate was slightly over 18% *faster!* That's not because Roc has some magical optimization that C can't access; it's just that the two implementations are different, and although on average roc-deflate is slower, for certain inputs it happens to be faster. So although it's _possible_ to get a speedup by switching from libdeflate to roc-deflate, you shouldn't expect it on average.

To be clear, C's performance ceiling is strictly higher than Roc's. For any input where roc-deflate currently outperforms libdeflate, arbitrary C code can close that gap. The reverse is not true; Roc code is memory-safe, does automatic reference counting, checks bounds automatically, and supports no Rust-style `unsafe` escape hatch to opt out of any of that. These properties give Roc code stronger safety guarantees than code written in C, Zig, Rust, and other languages that allow full access to the hardware—and the price it pays for those guarantees is a lower performance ceiling.

Obviously we can't extrapolate from this one result about how close Roc can get to C in the general case, but now something has been demonstrated that nobody knew was achievable before. As far as I know, this is the most optimization effort that has been put into any Roc package to date, so how close others can get to this result is a complete unknown right now. So while I'm thrilled by this result, I'm fully aware that we won't know how well it generalizes until we've optimized a wider sample of real-world Roc code bases!

## What the Performance Gap Buys

An obvious question is "Why settle for *any* amount slower?" If you *could* get C levels of performance, why not just use libdeflate itself and close that remaining gap?

A pure-Roc implementation has several advantages over a pure-C implementation:

- **Memory safety.** Roc code is 100% memory safe and has no language primitives that let you opt out of it. This code is only able to approach C levels of performance because Roc's optimization pipeline was able to determine that many bounds checks and reference counting operations were provably safe to optimize away. Compression packages written in pure Roc don't have access to the unchecked memory operation that caused yesterday's [Brotli Remote Code Execution vulnerability](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases#nodejs-brotli-decoder-out-of-bounds-write-permits-remote-code-execution-cve-2026-111497---high).
- **No side effects.** Roc's type system tracks which functions are pure and which can perform side effects. Pure functions' types use a thin arrow, like `Bool -> Bool`, whereas [effectful functions](https://roc-lang.org/docs/main/langref/functions/) use a thick arrow, like `Bool => Bool`. (As with memory safety, Roc enforces this and supports no way to opt out.) So when you see that roc-deflate's functions have only thin arrows in their annotations, you know they really are pure functions with no side effects.
- **Supply-Chain Security.** Roc does not have an arbitrary [FFI](https://en.wikipedia.org/wiki/Foreign_function_interface), meaning you know for sure that roc-deflate's pure functions can't even attempt to do I/O or access arbitrary memory. Given the massive increase in [supply chain attacks](https://shattered.io/npm-supply-chain-attacks-2026/), there's a concrete benefit to knowing that the damage a malicious actor can do with a pure function in a compromised Roc package is limited to returning the wrong value, crashing, or wasting system resources. Compromised packages can still cause harm, but in strictly fewer ways. Roc packages also don't support build scripts, which was the vector used to [successfully compromise the popular Rust `arrayref` package](https://blog.rust-lang.org/2026/08/20/supply-chain-attack-on-arrayref/) two months ago.
- **Portability.** Roc pure functions are designed to be extremely deterministic: they always return the same values when given the same arguments—not just when run on the same machine, but also on any target you compile that code to. (The functions may also crash or fail to terminate, but that behavior should also be deterministic across targets.) The only way a Roc pure function should be expected to behave differently when run on two different systems is if one system runs out of memory mid-execution and the other doesn't.

If any of these guarantees don't hold in practice, it can only be due to a defect in Roc's compiler, the [platform](https://www.roc-lang.org/docs/main/langref/platforms/) the application is running on, or the underlying hardware. So when you see in [roc-deflate's docs](https://niclas-ahden.github.io/roc-deflate/0.4.0/) that the entire package is 100% pure functions, you can be confident you are getting all of the above properties from everything the package has to offer. The type system enforces it!

The reason we've been working so hard on all this might become clearer if you look at the proposition in reverse: would you give up guaranteed memory safety, guaranteed lack of side effects, guaranteed deterministic behavior across all targets, and the security benefits of having no exploitable build scripts in packages...for an average speedup percentage in the single digits?

That answer can legitimately vary by use case—Roc's own compiler, for example, wants [the maximum performance the hardware can deliver](https://rtfeldman.com/rust-to-zig)—but I bet a lot of people reading this can see why we're so excited to have achieved this result.

## Roc-Specific Optimizations

Most of the optimizations that improved roc-deflate's numbers came from general optimization techniques that are widely beneficial across languages. (I always recommend [Casey Muratori's Performance-Aware Programming Series](https://www.computerenhance.com/p/table-of-contents), which I paid for and learned a lot from.) Some of the optimization techniques were Roc-specific, though, and I wanted to mention them here as a reference for others. Even if you're not writing Roc code, this can also give you an idea of [how Roc achieves its performance](https://youtu.be/vzfy4EKwG_Y?si=oYa6k2pFdsRJcQW7).

### Avoid Unnecessary Sharing

Roc's most critical optimization is _opportunistic mutation_ (which [Koka](https://koka-lang.github.io/koka/doc/book.html#why-perceus) calls ["Functional but In-Place"](https://koka-lang.github.io/koka/doc/book.html#sec-fbip)). You can learn how it works in Roc's [docs on opportunistic mutation](https://www.roc-lang.org/docs/main/langref/expressions/#opportunistic-mutation), but from a performance optimization perspective, it's critically important to avoid unnecessary sharing so that values remain unique and therefore eligible for in-place mutation.

### Hoist Bounds Checks

You can't opt out of bounds checks (e.g. getting a value out of a dynamically-sized collection) in Roc like you can in C, Zig, and Rust, but Roc's compiler can optimize them away if it knows they'd be guaranteed to pass. Bounds checks are most costly inside loops, so you can get a lot of mileage out of adding something like `if collection.len() <= highest_index_used_in_loop { return 0 }` before the loop starts. This adds an additional check that looks redundant, but it can allow the optimizer to safely delete costlier checks inside the loop, once it can tell that failures would not be reachable after that early return.

### Build Lookup Tables at Compile Time

[Roc's compile-time evaluation](https://www.roc-lang.org/docs/main/langref/compile-time/) can be used to assemble lookup tables at compile time as long as nothing depends on runtime inputs. Even better, since their lengths are known at compile time, you can do things like `Ok(entry) = lookup_table.get(5)` to do an [exhaustive pattern match](https://www.roc-lang.org/docs/main/langref/pattern-matching/#exhaustiveness) that Roc's compiler will know is valid thanks to compile-time evaluation. This skips the runtime bounds check that non-constant tables would otherwise need to pay for.

### Consider Wrapping Arithmetic

In Roc, `a + b` desugars to `a.plus(b)`. For an integer like [`U64`](https://www.roc-lang.org/docs/main/Num/#U64), [`U64.plus`](https://www.roc-lang.org/docs/main/Num/#U64.plus) includes an overflow check, whereas [`plus_wrap`](https://www.roc-lang.org/docs/main/Num/#U64.plus_wrap) does not. Although `plus` is the safer default, [overflow checks have a runtime cost](https://danluu.com/integer-overflow), as CPUs can do wrapping integer arithmetic in a single instruction. When Roc's compiler can prove that overflow won't occur, both `plus` and `plus_wrap` will optimize to the same instructions, but when it can't tell for sure, you can get a speedup by explicitly choosing `plus_wrap`.

## Room for Improvement

I'm sure there are still opportunities to improve roc-deflate's performance—especially on x64 CPUs—as well as the optimization pipeline in Roc's compiler itself.

At this point I feel reasonably confident that all the low-hanging fruit has been picked, but if anyone wants to try it out for themselves, [here's the script I ran to set up and run the benchmark suite on Linux](https://gist.github.com/rtfeldman/7b6830809149867b79761ffb8e0456c3). (Note that Claude Opus 5.5 generated this script, and I haven't vetted it for security; run it outside a sandbox at your own risk.) It pins both Roc compiler revisions and roc-deflate versions, so you'll want to adjust those commits if you're trying out potential improvements.

For my part, I'll be focusing on the upcoming Roc 0.1.0 release from now until it's out. It's been eight years in the making, so I'll be very happy for us to finally have a numbered release!
