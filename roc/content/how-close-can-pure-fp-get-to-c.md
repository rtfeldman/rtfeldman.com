# How close can pure FP get to C?

How close can code written in a functional programming language get to the performance of a systems-level language like C?

Since the Roc programming langauge has always aspired to both build fast and run fast, this question is important to me. Over the past few months, I've been grinding through performance optimizations on roc-deflate, Niclas Ahden's package for DEFLATE compression, to see how close we could get it to the performance of C's libdeflate on libdeflate's own test suite (where roc-deflate has bit-for-bit identical outputs).

Here's where we are today:

[graph goes here]

## ~10% Slower than C

So the Roc implementation ran these benchmarks about 10% slower than libdeflate on average (median), with Roc being being 15% slower on some examples, while on others being a little bit faster than libdeflate.

In the examples where Roc outperformed C, I can be certain the C code could be revised to close that gap...but the reverse is not necessarily true. Maximum control is the beauty of systems languages! Roc is memory-safe, does automatic reference counting, has bounds checks, and supports no Rust-style `unsafe` escape hatch to opt out of any of that. These properties give Roc code stronger safety guarantees than C code, at the cost of an inescapably lower performance ceiling. 

So while I'm thrilled by this result, I have to be careful not to generalize it prematurely. Before the optimization work, the Roc implementation benchmarked several times slower than libdeflate (which of course has had many rounds of optimization), and as far as I know, this is the most optimization work that's gone into any Roc package. The learning process even led to some changes to Roc's compiler! We won't know how close other Roc packages can get until they've had similar efforts put into them.

## What the Performance Cost Buys

An obvious question is "Why settle for 10% slower?" In other words, if you *could* get C levels of performance, why not just use libdeflate itself and close that remaining gap?

A pure-Roc implementation has a number of guarantees that a pure-C implementation does not:

- **Memory safety.** Roc code is 100% memory safe and has no language primitives that let you opt out of it. This code is only able to approach C levels of performance because Roc's optimization pipeline was able to determine that many bounds checks and reference counting operations were provably safe to optimize away.
- **No side effects.** Roc's type system tracks which functions are pure and which can perform side effects. Pure functions' types use a thin arrow, like `Bool -> Bool`, whereas _effectful_ functions use a thick arrow, like `Bool => Bool`. (As with memory safety, Roc enforces this and supports no way to opt out.) So when you see that roc-deflate's functions have only thin arrows in their annotations, you know they really are pure functions with no side effects.
- **Portability.** Roc pure functions are designed to give the same 

If any of these guarantees don't hold in practice, it can only be due to either a bug in Roc's compiler, or a violation of Roc's [Platform Contract].

which means we have to be careful not to prematurely generalize this result.







A longstanding tension in programming has been the desire to have the guarantees of memory-safe code but the performance of memory-unsafe code. 

A longstanding tension in programming has been the desire to have the guarantees of memory-safe code but the performance of memory-unsafe code. There have been a few different popular approaches to this:

* Be memory-safe by default, but tolerate isolated chunks of unsafety. Think garbage-collected languages doing C FFI for database drivers, or Rust's `unsafe` blocks. This buys performance at the cost of trust; you'd think a lot harder before visiting a new website if browsers let JavaScript code execute arbitrary machine instructions.
* Support only memory-safe operations. Think JavaScript in the browser, WebAssembly, Lua, or Fil-C. These have limitations on both performance and what operations are supported (especially I/O), but in return you can run untrusted code without worrying about what it could do to your machine. You only have to trust the implementation of the envronment it's running in (e.g. the browser, the Wasm runtime, etc.), not the application code.

The Roc programming language falls into the latter group. 
















Most languages support a Foreign Function Interface (FFI) for runnning arbitrary C code, but for years this was not true of the world's most popular language. Until Node.js took off, all JavaScript code ran in the browser, and there was no WebAssembly; the only non-JS functions you could call were the C++ ones the browser provided.

There's a good reason for this! If viewing a page carried a credible risk of getting a virus, the Web would see much less use. C code can compile straight to low-overhead machine code, but arbitrary machine code is arbitrarily risky to execute. Any language with full C FFI is as safe as a bank vault with an unlocked back door.

## No FFI By Design

In the Roc programming language, applications can't do C FFI.

Instead, Roc has something like a generalization of the way JS-in-the-browser works: every Roc application selects exactly one Roc _platform_ (either off-the-shelf, or roll your own) which is implemented in a low-level language, and which is the only source of I/O primitives that application can access. It's like how the browser (also implemented in a lower-level language) is the only source of I/O primitives that JS applications can use. 

As with JS, Roc is memory-safe, and has no C FFI that could backdoor around these guarantees. This is particularly valuable in domains where restricting access to I/O primitives is important—security-critical scripts, plugin systems, serverless environments where only certain I/O operations are even supported, etc. 

However, no FFI means no dropping down into C for performance-critical code that isn't available as a platform primitive. In the browser, JavaScript's 


From a safety perspective, Roc is closer to JS-in-the-browser than to languages with C FFIs. No matter how many lines of JS code are in the code base, and no matter where they came from, if the browser is implemented correctly, end users are safe. Roc's platforms-and-applications design is similar: there's a bright line between the low-level _platform_ implementation that the pure-Roc _application_ runs on. As long as the platform is correct, the application has no C FFI that can break out of its sandbox.






All C sandboxes (e.g. WASM for memory and I/O control, Fil-C for memory safety, etc.) have significant overhead, and 



Nowadays, JavaScript in the browser can kick out to WebAssembly for access to lower-level instructions running in a sandbox. There's still significant overhead compared to actual machine instructions.








In memory-safe languages, it's common to implement performance-critical functions as wrappers around C libraries. Like with Rust's `unsafe` keyword, the idea is to have an isolated chunk of faster-but-unsafe code wrapped in an otherwise memory-safe language. 






The Roc programming language rewards writing pure functions in plain Roc. Besides the stronger memory safety guarantees, pure Roc functions can also be run at compile-time, are guaranteed to give the same answer for the same inputs regardless of compilation target, and other benefits we'll discuss later. All well and good, but Roc's performance ceiling is lower than C's...so how much speed do we give up for those benefits?

Here's an example of DEFLATE compression, which is often implemented as a wrapper around highly performance-optimized C libraries like zlib, zlib-ng, or libdeflate. roc-deflate, which is essentially a pure-Roc package port libdeflate (a streaming API based on zlib is on the roadmap), has in its test suite all the same examples that libdeflate does, so we can compare their performance directly.

In other words, how close can a purely functional implementation of roc-deflate get to libdeflate's performance?





 Some of the benefits:

- Roc has a first-class distinction between pure functions and effectful functions. Pure functions can be called by any function, and can be executed at compile time, but effectful functions can only be called by other effectful functions. Roc's compiler enforces this, and by design there's no way to opt out of it.
- Functions implemented in other languages are always considered effectful. Also by design, there's no way to opt out of that classification.

Putting these together


## Techniques

Some of these are just general perf opt techniques that aren't specific to Roc. For example: 

- Avoid unnecessary copying and heap allocations
- Avoid register spilling
- If autovectorization doesn't kick in when you want to it, use explicit vector operations (link to examples in builtins)

That said, here

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
