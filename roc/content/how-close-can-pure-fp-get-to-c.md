# How close can pure FP get to C?

How close can real-world code written in a functional programming language get to the performance of a language like C?

Since [Roc](https://roc-lang.org) has always been a functional language that aspired to both build fast and run fast, this question is important to me. Over the past few months, I've been grinding through performance optimizations on [roc-deflate](https://github.com/niclas-ahden/roc-deflate), a package [Niclas Ahden](https://www.youtube.com/@NiclasAhden) wrote (and [has been using in production for pay](https://youtu.be/12yVcgQHAK0?si=JETe6lec5y4jCLVL)) for [DEFLATE compression](https://en.wikipedia.org/wiki/Deflate). 

My goal was to see how close we could get to the performance of the C library [libdeflate](https://github.com/ebiggers/libdeflate) on libdeflate's own test suite, for which roc-deflate produces identical outputs. Here are the current benchmarks, running on the 2021 M1 MacBook Pro where I did all the optimization work:

[graph goes here]

## ~10% Slower than C

roc-deflate ran these benchmarks slower on average than libdeflate, by 6.5% in the median case. That's on the order of 10% slower, which is a very exciting result for a fully memory-safe language with automatic memory management going up against a code base that doesn't even have to do bounds checks! Obviously we can't extrapolate from one result about how close Roc can get to C in the general case, but now something has been demonstrated that previously we didn't even know was achievable.

There are other noteworthy numbers in the benchmarks besides just the median. For example, on some inputs, roc-deflate was a full 20% slower than libdeflate. On others, roc-deflate was as much as 20% *faster* than libdeflate! That's not because Roc has some magical optimization that C can't access; it's just that our implementation is different than theirs, and although on average ours is slower, for some inputs it happens to be faster. 

That said, C's performance ceiling is strictly higher than Roc's. For any input where roc-deflate currently outperforms libdeflate, its C code could certainly close that gap if desired. The reverse is not true; Roc code is memory-safe, does automatic reference counting, has bounds checks, and supports no Rust-style `unsafe` escape hatch to opt out of any of that. These properties give Roc code stronger safety guarantees than code written in C, Zig, Rust, and other languages that allow full access to the hardware—and the price we pay for those guarantees is a lower performance ceiling. 

So while I'm thrilled by this result, we won't know how well it generalizes until we've optimized a wider sample of real-world Roc code bases. Before the optimization work, the Roc implementation benchmarked several times slower than libdeflate (which of course has had many rounds of optimization), and as far as I know, this is the most optimization work that's gone into any Roc package. The learning process even led to some changes to Roc's compiler! We won't know how close other Roc packages can get until they've had similar efforts put into them.

> Incidentally, I also haven't done any work to optimize roc-deflate on x64 hardware yet. Shortly before writing this post, I ran the same test suite on an AMD Ryzen 9 3900X Linux machine for the first time. In that run, roc-deflate was between 6.8% faster and 46.5% slower than libdeflate, with a median of roc-deflate being 19.7% slower. (For reference, on my ARM M1 MacBook, roc-deflate was between 20% faster and 20% slower, with a median of being 6.5% slower. I haven't investigated the underlying causes of that discrepancy yet, but wouldn't be surprised to find some low-hanging fruit.)
>
> If anyone wants to try this out for themselves, [here's the script I ran to set up and run the benchmark suite on Linux](https://gist.github.com/rtfeldman/4378a554061c9d74e3755158db6d3ac9). Note that Claude Opus 5.5 generated this script, and I haven't vetted it for security; run it outside a sandbox at your own risk!

## What the Performance Cost Buys

An obvious question is "Why settle for ~10% slower?" If you *could* get C levels of performance, why not just use libdeflate itself and close that remaining gap?

A pure-Roc implementation has several guarantees that a pure-C implementation does not:

- **Memory safety.** Roc code is 100% memory safe and has no language primitives that let you opt out of it. This code is only able to approach C levels of performance because Roc's optimization pipeline was able to determine that many bounds checks and reference counting operations were provably safe to optimize away.
- **No side effects.** Roc's type system tracks which functions are pure and which can perform side effects. Pure functions' types use a thin arrow, like `Bool -> Bool`, whereas [effectful functions](https://roc-lang.org/docs/main/langref/functions/) use a thick arrow, like `Bool => Bool`. (As with memory safety, Roc enforces this and supports no way to opt out.) So when you see that roc-deflate's functions have only thin arrows in their annotations, you know they really are pure functions with no side effects.
- **Security.** Roc does not have an arbitrary [FFI](https://en.wikipedia.org/wiki/Foreign_function_interface), meaning you know for sure that roc-deflate's pure functions can't even attempt to do I/O or manipulate memory. Given the massive increase in [supply chain attacks](https://shattered.io/npm-supply-chain-attacks-2026/), there's a concrete benefit to knowing that the damage a malicious actor can do with a pure function in a compromised Roc package is limited to returning the wrong value, crashing, or wasting system resources. Roc packages also don't support build scripts, which was the vector used to [successfully compromise the popular Rust `arrayref` package](https://blog.rust-lang.org/2026/08/20/supply-chain-attack-on-arrayref/) two months ago.
- **Portability.** Roc pure functions are designed to be extremely deterministic: they always return the same values when given the same arguments—not just when run on the same machine, but also on any target you compile that code to. (The functions may also crash or fail to terminate, but that behavior should also be deterministic across targets.) The only way a Roc pure function should be expected to behave differenly when run on two different systems is if one system runs out of memory mid-execution and the other doesn't.

If any of these guarantees don't hold in practice, it can only be due to a defect in Roc's compiler, the [platform](https://www.roc-lang.org/docs/main/langref/platforms/) the application is running on, or the underlying hardware. So when you see in [roc-deflate's docs](https://niclas-ahden.github.io/roc-deflate/0.4.0/) that the entire package is 100% pure functions, you can be confident you are getting all of the above properties from everything the package has to offer. The type system enforces it!

The reason we've been working so hard on all this might become clearer if you look a the proposition in reverse: would you give up guaranteed memory safety, guaranteed lack of side effects, guaranteed deterministic behavior across all targets, and the security benefits of having no build scripts in packages or possible malicious I/O concern from pure functions...for a performance difference on the order of 10%?

That answer can legitimately vary by use case, but I bet a lot of people reading this can see why we're so excited to have achieved this result.

## Roc-Specific Optimizations

Most of the optimizations that improved roc-deflate's numbers came from bread-and-butter optimization techniques that work well in most languages. (I always recommend [Casey Muratori's Performance-Aware Programming Series](https://www.computerenhance.com/p/table-of-contents), which I paid for and learned a lot from.) Some of the optimization techniques were Roc-specific, though, and I wanted to mention them here as a reference for others.

### Avoid Unnecessary Sharing

These are copies for stack allocated things, and defeats in-place mutation for heap allocated things.

### Hoisting bounds checks
- our optimizer can infer when bounds checks can be elided
- the more inputs there are into a given number, the more likely it is that some edge case path emerges which makes the check no longer safe to elide. (Also, without inlining or specialization.)
- the place where these really hurt is inside loops, not just because they run a lot, but because they block other optimizations
- if we can to the bounds check outside the loop, once, it'll be cheap (although not free like in C), and the odds get way higher that inside the loop the optimizer can know it's safe to elide
- I wouldn't write this code this way from the outset. This is a good example of the difference between optimization and non pessimization. This might be a waste of time that actually makes the program slightly slower if it doesn't unlock bounds check elision, so it only makes sense to do it after you're actually measuring things, disassembling, etc.

This is also a good example of how we can get so close to C levels of perf. Yes, we do have an additional check at runtime that C doesn't. No, we can't safely get rid of it. But for that to matter, you have to be working in a domain where decompression being even 10% slower is not worth all the benefits Roc is bringing in comparison to C. That's some projects but obviously not all projects!

Also remember that this is a library that's intended to be widely used. I wouldn't bother to do this level of performance optimization on a SaaS backend where any gains at this level would be a rounding error compared to adding or removing a single database index.
