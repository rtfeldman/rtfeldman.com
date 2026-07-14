# How Our Rust-to-Zig Rewrite is Going

<aside class="timestamp">
    <time datetime="2026-07-15">July 15, 2026</time>
</aside>

<hr />

For the past year and a half, the team building [Roc](https://www.roc-lang.org/)'s compiler has been rewriting our 300,000 lines of Rust code into [Zig](https://ziglang.org/), for reasons I'll recap below. We recently passed an exciting milestone: feature parity with the original compiler\!

Since the Bun project recently shared [an experience report](https://bun.com/blog/bun-in-rust) of their rewrite in the other direction (from Zig to Rust, although that's only the tip of the iceberg of differences between our rewrites), this seems like a nice time to reflect on how our move from Rust to Zig is going.

## Passing Feature Parity

Hitting this milestone made it possible to update [Brendan Hansknecht](https://github.com/bhansconnect)'s charming 2024 [WASM-4](https://wasm4.org/) game, [Rocci Bird](https://github.com/lukewilliamboswell/roc-wasm4/blob/d4161199b0a8afd55d24c30dae304b8a0358f433/examples/rocci-bird.roc) (with art by Luke DeVault) to use the new compiler. It's a nice example because the whole game is under a thousand lines of Roc code, and you can [play it on itch.io](https://itch.io) or right here via [WebAssembly](https://webassembly.org/):

\[embedded rocci bird will go here\]

Rocci Bird's updated source code is a bit more concise than [the original](https://github.com/lukewilliamboswell/roc-wasm4/blob/a769ade51cbd4613b4fca468764c9034f9c8070c/examples/rocci-bird.roc), and `roc build --opt=size` now outputs a 31KB wasm binary. (The original compiler produced a binary more than double that size.) Rocci Bird is by no means a large code base, but getting it to run at all required landing a *lot* of features in the new compiler. Seeing those chunky purple pixels brought a smile to my face when we finally got there\!

To be clear, this is a milestone but not a formal release. We aim to land version 0.1.0 of the new compiler later this year, which will be Roc's first-ever numbered release. You're welcome to try out a [Nightly build](https://roc-lang.org/install/) before then, but in its current state you can still expect a variety of bugs, incomplete features, and unfinished docs.

That said, this is a wonderful milestone to have reached, and I'm extremely grateful to all the people who came together to make this happen\! I want to thank some in particular who have been especially helpful in getting the language and compiler to this point:

* [Anthony Bullard](https://github.com/gamebox) and [Sam Mohr](https://github.com/smores56) for collaborating on the new parser  
* [Jared Ramirez](https://github.com/jaredramirez) for the new type-checker (among many other things\!)  
* [Ayaz Hafiz](https://github.com/ayazhafiz/) for [the new lambda set resolution system](https://github.com/ayazhafiz/cor/), plus tons of the original compiler  
* [Aurélien Geron](https://github.com/ageron) for hand-updating 108 (\!) beginner exercises in [the Roc Exercism course](https://exercism.org/tracks/roc) he originally created  
* [Stephan](https://github.com/stephdin) for getting the compiler's new "echo" platform running in the browser, so that anyone can now write *and* run basic Roc programs from the [roc-lang.org](https://roc-lang.org) homepage via a 2.5MB WebAssembly binary\!  
* [Niclas Åhdén](https://github.com/niclas-ahden), Roc's most prolific production user, for patiently filing helpful bug reports and giving actionable feedback about the upgrade process  
* [JRI98](https://github.com/JRI98) for methodically reproducing and investigating fuzzer errors and other bugs, closing out issues that no longer reproduced, and more  
* [Jasper Woudenberg](https://github.com/jwoudenberg) for iterating on API designs for userspace packages using the new compiler  
* [Folkert de Vries](https://github.com/folkertdev), [Brendan Hansknecht](https://github.com/bhansconnect), [Brian Carroll](https://github.com/brian-carroll), [Josh Warner](https://github.com/joshuawarner32), [Agus Zubiaga](https://github.com/agu-z), and [Jelle Teeuwissen](https://github.com/JTeeuwissen) for building the foundation of the original compiler, without which the new compiler never would have existed  
* I've saved the undisputed biggest contributors to the new compiler for last: [Anton-4](https://github.com/Anton-4) and [Luke Boswell](https://github.com/lukewilliamboswell/) for so many things I can't even keep track of them all—compiler work, builtins, platforms, packages, examples, fixing bugs, helping beginners on Roc Zulip…enumerating it all could take up a whole second post\! It's been incredible seeing how much you've built.

Thank you all so much\! I feel honored that you've put so much of your valuable time into this project. Also thanks to our past and present sponsors—[rwx](https://www.rwx.com/), [Lambda Class](https://lambdaclass.com/), [ohne-makler](https://www.ohne-makler.net/), [martian](https://withmartian.com/), [tweede golf](https://tweedegolf.nl), [Vendr](https://www.vendr.com/), [NoRedInk](https://www.noredink.com/), and many [generous individual sponsors](https://github.com/sponsors/roc-lang/)—who have helped get us to this point by [supporting our contributors](https://roc-lang.org/donate).

Speaking of time: our 487-day rewrite took 476 days longer than [Bun's 11-day rewrite](https://bun.com/blog/bun-in-rust) from their million lines of Zig into a million lines of Rust. There are many reasons for this difference which have nothing to do with Rust or Zig, including the fact that theirs was a direct port whereas we'd decided to rewrite *because* of how much we were going to change. [The techniques they used](https://bun.com/blog/bun-in-rust#claude-rewrite-bun-in-rust) wouldn't have worked in our case.

The laundry list of changes we made also means comparing our original Rust code base and new Zig code base won't be apples-to-apples. Still, we've reached a nice point to reflect on how the rewrite has gone, both in terms of what new features it has unlocked for Roc programmers, as well as how our experiences with Rust and Zig have compared.

Let's get into it\!

## Hot Code Loading \+ Cross-Compiled Binaries

Roc's new compiler automatically does hot code loading during development. For example, I can run `roc server.roc` to start a Web server, then change some of its code while it's running. The next time that server handles a request, it'll automatically be handled using the new code. Here it is in action, both in a server and in a simple 2D game running at 120fps:

<video class="inline-video" controls preload="metadata" playsinline>
    <source src="/assets/hot-loading.mp4" type="video/mp4">
    <a href="/assets/hot-loading.mp4">Download the hot-loading demo video.</a>
</video>

Hot loading is standard behavior for interpreted languages like Python, but not so much for high-performance compiled languages like Roc.

When I'm ready to deploy, `roc build server.roc` gets me an LLVM-optimized, self-contained executable that I can drop onto a machine and run. It also cross-compiles; no matter whether you're running macOS, Linux, or Windows, all of the following commands work, and output reproducible binaries (meaning the same input source bytes always produce the same output executable bytes—which [not all compilers do](https://xeiaso.net/notes/2026/anubis-wasm-vendor-binary/)) that will run on the target system:

| Command | Output binary runs on |
| :---- | :---- |
| `roc build --target=wasm32` | WebAssembly |
| `roc build --target=arm64mac` | macOS Apple Silicon (use `x64mac` for Intel) |
| `roc build --target=x64win` | x64 Windows (`arm64win` for 64-bit ARM) |
| `roc build --target=x64glibc` | normal Linux distros (ones with [glibc](https://www.gnu.org/software/libc/)) |
| `roc build --target=x64musl` | Linux distros without glibc (e.g. [Alpine](https://www.alpinelinux.org/about/)) |
| `roc build` | (whatever the current system is) |

The HTTP request-handling logic from that video looks like this:

`# Starts up the server; initializes a database and logger`  
`# based on environment variables.`  
`init! = |env, _args| {`  
    `{ log_level, db_credentials } = env.parse()?`

    `db = init_db!(db_credentials)?`  
    `log = init_logger!(log_level)?`

    `# (other such initializations would happen here)`

    `Ok({ db, log })`  
`}`

`# Handles an incoming HTTP request (HTTP verb,`   
`# path, headers, body) using the db and log that`  
`# we initialized during init!()`  
`handle_req! = |{ db, log }, verb, path, headers, body| {`  
    `auth_token = headers.x_auth_token`  
    `user_agent = headers.user_agent`

    `app = App.init({ auth_token, user_agent, db, log })?`

    `match (verb, path) {`  
        `(GET, "/users/${id}") => app.user_profile!(id)`  
        `(GET, "/users/${id}/${page}") => match page {`  
            `"" | "profile" => app.user_profile!(user_id)`  
            `"settings" => app.user_settings!(user_id)`  
            `"posts/${post_id}" => {`  
                `app.user_post!(user_id, post_id)`  
            `}`  
            `_ => app.not_found!(verb, path)`  
        `}`  
        `(POST, "/posts/new") => {`  
            `app.new_post!(body)`  
        `}`  
        `_ => app.not_found!(verb, path)`  
    `}`  
`}`

This uses several features we introduced in the new compiler. For example, that `"/users/${id}"` syntax is not implemented with [parsing template strings at runtime](https://expressjs.com/en/guide/routing/#route-parameters), but rather with a new language feature: string interpolation inside pattern matching.

Not only is this type-safe at compile time, this entire code snippet performs *zero heap allocations*. (We even have a regression test which sends various requests to a HTTP server running this code, and the test fails if the server attempts a single heap allocation at any time.) I'd expect the typical language that ships with hot code loading to average closer to 1 allocation per line of code here…but Roc is aiming high on ergonomics, type safety, *and* performance\!

In what will become a recurring theme, hot code loading is innately memory-unsafe. We generate arbitrary machine instructions and have the CPU execute them—already memory-unsafe, but that's every compiler's job—and on top of that, we swap out some instructions for others while the compiled program is still running. There's a lot to get right, and we appreciate all the help we can get from our tools\!

## Compile-Time Evaluation of Pure Functions

We didn't get zero heap allocations in this common use case by chance; we got it by designing and implementing the new compiler to aggressively avoid doing unnecessary work at runtime. One of the strategies which avoids runtime allocations in this specific example is doing work at compile time instead of runtime.

As an example, Python's popular FastAPI server framework lets you parse HTTP headers directly into Python objects based on the field names defined in the object's class. Here's a simplified [example from FastAPI's docs](https://fastapi.tiangolo.com/tutorial/header-param-models/#check-the-docs):

`class CommonHeaders(BaseModel):`  
    `host: str`  
    `save_data: bool`  
    `if_modified_since: str | None = None`

`@app.get("/items/")`  
`async def read_items(headers: Annotated[CommonHeaders, Header()]):`  
    `# …use headers somehow here`

Presumably you'd go on to use `headers` somehow in the body of `read_items`. By default, FastAPI will look for a HTTP header named `if-modified-since` (case-insensitive) to parse into the field named `if_modified_since`, because Python uses [snake\_case](https://en.wikipedia.org/wiki/Snake_case) whereas HTTP headers use [kebab-case](https://en.wikipedia.org/wiki/Letter_case#Kebab_case). This is done automatically based on the field name at runtime, at the cost of one heap allocation per field.

If you ported this example to Rust with [salvo](https://docs.rs/salvo/latest/salvo/extract/index.html), you'd get about the same level of convenience—but with full type safety and fewer runtime allocations:

`#[derive(Deserialize, Extractible, Debug)]`  
`#[serde(rename_all = "kebab-case")]`  
`#[salvo(extract(default_source(from = "header")))]`  
`struct CommonHeaders {`  
    `host: String,`  
    `save_data: bool,`  
    `if_modified_since: Option<String>,`  
`}`

`#[handler]`  
`async fn read_items(headers: CommonHeaders) -> String {`  
    `// …use headers somehow here`  
`}`

You'd still have some runtime allocations though, because all of those fields except `save_data` have types involving heap allocations.

Roc's equivalent is also fully type-safe, but it performs no runtime heap allocations at all, and is a one-liner with no type declarations or annotations of any kind:

`read_items = |headers| # …use headers somehow here`

That's it, that's the code. You can try it out for yourself\! The way this works in Roc is:

* Roc has a full type inference system which means it's always able to infer the type of everything in the program, even if there are no type annotations anywhere, and it always infers the most general type that could fit there.  
  * Formally speaking, Roc does [principal](https://en.wikipedia.org/wiki/Hindley%E2%80%93Milner_type_system#Principal_type), [decidable](https://en.wikipedia.org/wiki/Decidability_\(logic\)#Decidability_of_a_theory), [sound](https://en.wikipedia.org/wiki/Type_safety#Definitions), [Hindley-Milner type inference](https://en.wikipedia.org/wiki/Hindley%E2%80%93Milner_type_system).  
* Because of this, you don't need to write out the whole `class CommonHeaders` definition like in Python; that type information will be inferred at compile time based on how you use the fields like `if_modified_since` and the rest.  
* Whereas many languages like Python and JavaScript represent "a group of fields" as a heap-allocated object, Roc instead represents them as a stack-allocated `struct` like you'd find in C, Go, Rust, Zig, etc.  
  * Those languages require defining the struct type ahead of time, like Python does with the class definition, but in Roc you can just use anonymous curly-brace literals (they look just like JavaScript object literals) and they compile to the equivalent of C structs at runtime.  
* Roc also has ways to implement things like HTTP header parsers (though of course not limited to that use case) using this statically-known type information.  
  * This is all done using ordinary Roc expressions and values; there isn't a separate metaprogramming language or anything like that. It's just normal Roc functions running at compile time, being automatically passed values that represent statically-known type information.  
* These parsers can be built by executing Roc code at compile time.  
  * In this case, what runs at compile time is code that receives the string names of the fields at compile time, e.g. `"if_modified_since"` and `"save_data"`, and then converts it—still at compile time—into kebab-case strings like `"if-modified-since"` and `"save-data"`.  
    * Like all heap allocations that get produced during Roc's compile time evaluation, these strings end up deduplicated in the final binary's static memory. No runtime heap allocations involved.  
  * It then builds a parser which takes the raw HTTP header string, searches case-insensitively for these kebab-case strings, and when it finds one, loads it into the appropriate `header` field.  
    * Loading the parsed HTTP value into the `header` field doesn't need to allocate, because at runtime it's just a reference to a subset of the original HTTP request string.  
      * Roc strings are semantically immutable, and are allowed to share runtime memory with other strings. The parser takes advantage of that.  
    * Rust's [slices](https://doc.rust-lang.org/std/primitive.slice.html) and [`Cow`](https://doc.rust-lang.org/std/borrow/enum.Cow.html)s do this, but they require introducing annoying lifetime parameters to structs, which is presumably why libraries like salvo don't do it this way even though it's faster at runtime.  
      * Roc doesn't have lifetime parameters, and you'd actually have to go out of your way to write a HTTP header parser that did allocations instead of sharing like this.

So I wasn't kidding\! This really is the one line you need, and it gets you fewer heap allocations than even the equivalent Rust version:

`read_items = |headers| # …use headers somehow here`

Oh, and it will early-return a [HTTP 400](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/400) response if any non-optional headers were missing from the request, based on how you used your fields; like Rust, Roc also has [sum types](https://en.wikipedia.org/wiki/Algebraic_data_type) and no [billion dollar mistake](https://en.wikipedia.org/wiki/Null_pointer).

To be clear, you can absolutely build a faster-performing HTTP server in a systems language like Rust or Zig or C than you can in Roc. Automatic memory management has a cost\! What I like about this example is not that it runs at absolute maximum performance, but that you're getting a lot of convenience *and* a lot of performance out of concise code that's fully type-safe.

None of this is specific to HTTP headers, of course. The language features that make this possible can work the same way with JSON, image file formats, binary database query responses, and other strings or binary data you might want to parse. We had some of this functionality in the original compiler, but not the full experience.

Continuing the recurring theme, compile-time execution of code we just compiled is innately memory-unsafe. As with hot code loading, we generate arbitrary machine instructions and have the CPU execute them, and on top of that, some of the memory involved in that execution is shared between the compiler and the running program—because they both need to read and write it\!

## Why a Scratch-Rewrite?

Unlike Rust, C, and Zig, Roc is not a systems language; it has automatic memory management (using reference counting, both to avoid tracing collector pauses and also for [Perceus optimizations](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/11/perceus-tr-v4.pdf) and opportunistic mutation [like Koka's](https://koka-lang.github.io/koka/doc/book.html#sec-fbip)). Roc would have *way* more heap allocations if it needed one heap allocation per closure capture (like most non-systems languages do), but our closure captures don't heap-allocate because Roc is the first non-academic language to implement [polymorphic defunctionalization through lambda set specialization](https://www.cs.princeton.edu/~mpmilano/publication/lss/).

This might sound like a niche optimization, but in a functional language like Roc, defunctionalization turns out to be similar to [inlining](https://en.wikipedia.org/wiki/Inline_expansion) in that it unlocks a treasure trove of follow-up optimizations. Although this system proved incredibly beneficial to Roc's runtime performance, it also proved incredibly difficult for us to implement correctly. We [struggled with nasty bugs](https://shows.acast.com/software-unscripted/episodes/664fde448c77cc0013b3338a) in the original implementation, and only after [Ayaz prototyped a new architecture](https://github.com/ayazhafiz/cor/) were we able to finally get it right in the new compiler. And even after all that, integrating it with everything else was hard, too\!

The good news about Ayaz's prototype was that it demonstrated that our defunctionalization problems were fixable. The bad news was that it also showed that the root of the problem was architectural and crossed multiple compiler phases; fixing it would require rewriting at least half of the compiler.

This was one of the main reasons we decided to do a full rewrite in the first place—that, and several other contributors independently mentioning they were planning to rewrite other parts of the compiler for unrelated reasons. At some point we realized we were about to rewrite almost all of the compiler anyway, so it logically made sense to consider a full rewrite as an alternative to the [Ship of Theseus](https://en.wikipedia.org/wiki/Ship_of_Theseus) approach.

Compilers are unusual in that scratch-rewrites are the norm among successful projects. It's often the only way to [self-host](https://en.wikipedia.org/wiki/Self-hosting_\(compilers\)), although not all compilers rewrite into their own language; see for example [TypeScript's rewrite to Go](https://devblogs.microsoft.com/typescript/typescript-native-port/). My position has always been that [Roc's compiler should not self-host](https://www.roc-lang.org/faq#self-hosted-compiler), so the idea that someday the benefits of a rewrite might seem to outweigh [their notorious costs](https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/) had frankly never occurred to me.

Once we'd decided to scratch-rewrite, the next question was whether to choose Rust again. Based on our experiences with both Rust and Zig ([we were already using Zig](https://www.youtube.com/watch?v=jIZpKpLCOiU) for a bunch of primitives in our standard library), [we decided to build the entire compiler in Zig this time](https://gist.github.com/rtfeldman/77fb430ee57b42f5f2ca973a3992532f).

## Why Zig?

I enjoy Rust, [I've taught a course on it](https://frontendmasters.com/courses/rust/), and I happily use it daily for my work at [Zed](https://zed.dev/). Despite what Internet comments might have us believe, it's extremely normal for one language to be the best fit for one project, while a different language turns out to be the best fit for a different project. One size does not actually fit all\!

I've talked in depth about our reasons for going with Zig elsewhere—[in writing](https://gist.github.com/rtfeldman/77fb430ee57b42f5f2ca973a3992532f), [on podcasts](https://www.youtube.com/watch?v=E0n82muHMcM), and so on—and we only seriously considered Rust and Zig, because those were the only languages our team knew well enough. (Roc's standard library has been [written in Zig](https://youtu.be/jIZpKpLCOiU?si=ueY5kfKu1p7I7L4c) for years.) The biggest considerations on our minds when deciding between Rust and Zig were:

* **Build times.** Our `cargo` build times were a major pain point, even for incremental builds. We expected our Zig build times to be faster.  
* **Memory control.** We use a variety of different memory allocators throughout compilation, especially arenas, and struct-of-arrays layouts all over the place. Rust's ecosystem consistently assumes one global allocator, including [soa\_rs](https://docs.rs/soa-rs/latest/soa_rs/) (and there's no out-the-box struct-of-arrays support like Zig's std.MultiArrayList). As such, in the original compiler we often felt drawn toward rolling our own alternatives to standard Rust tools, and being frustrated that third-party dependencies were hardcoded to use the global allocator. Meanwhile, Zig's whole ecosystem assumes granular allocators, and struct-of-arrays support is standard.  
* **Ecosystem relevance.** Rust's ecosystem is much bigger than Zig's overall…but almost no packages in either ecosystem are relevant to our particular needs. For the niche things we wanted to get off the shelf—such as a faster way to emit LLVM bitcode than wrapping LLVM's C++ library—more of that code existed in Zig than in Rust.  
* **Memory-unsafety assistance.** Rust is designed to isolate memory-unsafe code inside rare `unsafe` blocks, and use things like [miri](https://github.com/rust-lang/miri) or [Valgrind](https://valgrind.org/) to vet those. Memory-unsafe code wasn't rare for us, though (remember those innately-unsafe features I've pointed out already? Those weren't the only ones\!) and we ended up with about 1,200 uses of `unsafe` (out of our 300K lines of Rust code; compare to about 40,000 uses of `unsafe` in [rust](https://github.com/rust-lang/rust/)'s 3.5M lines, and remember that for compilers which emit machine code, like `roc` and `rustc`, doing memory-unsafe things is a big part of the job). Zig has [more features than Rust for making memory-unsafe code work correctly](https://zackoverflow.dev/writing/unsafe-rust-vs-zig/), and that was the part we felt was harder to get right.

There were a variety of other reasons, but I'd say these were the main ones: we wanted faster build times, better allocator control, a more relevant ecosystem, and stronger assistance with memory-unsafe code.

After a year and a half of rewriting, how did our expectations of Zig's benefits line up with the reality of what we got? And which parts of Rust did we end up missing once we no longer had access to them?

## Life Without Borrow-Checking

Let's start with the big one: the borrow checker. It's been many years since I was a Rust beginner and felt like I was "fighting the borrow checker," and at this point I get to appreciate its benefits without (usually) feeling frustrated about its restrictions.

That said, it's important to contextualize what the borrow checker does and doesn't do. There's [a famous 2019 Microsoft presentation](https://github.com/Microsoft/MSRC-Security-Research/blob/master/presentations/2019_02_BlueHatIL/2019_01%20-%20BlueHatIL%20-%20Trends%2C%20challenge%2C%20and%20shifts%20in%20software%20vulnerability%20mitigation.pdf) that says, on slide 10:

\~70% of the vulnerabilities addressed through a security update each year continue to be memory safety issues

The next slide breaks down that 70% with details that are important when comparing Rust and Zig. It notes "Stack corruptions are essentially dead," and shows that in 2018 (the last year studied), 23% of the vulnerabilities were out-of-bounds reads/writes, 16% were use-after-free, 13% were unsafe casts, and 10% were uninitialized reads.

Relevantly for our particular rewrite, **Rust and Zig address 84% of these memory-safety bugs in the same way**:

* Both compilers prevent stack corruptions using guard pages and stack probes, which cause OS memory protections to raise segmentation faults instead of corrupting memory. (An unhandled segfault may not be the most graceful way for a program to end, but it's still a safe exit—unlike corrupted memory.)  
* Both compilers emit bounds checks for heap memory, so if you write `things[9]` on an array of length 4, you get a panic instead of corrupted memory.  
* Both compilers report errors for uninitialized reads by default, and neither does unsafe casts automatically. (Both languages let you opt into these.)

The remaining 16% of the vulnerabilities are use-after-frees, which Rust famously addresses with borrow-checking at compile time. In contrast, Zig does what both compilers do for out-of-bounds errors: insert automatic runtime checks that panic instead of allowing memory corruption. Zig's use-after-free (and double-free) guards are enabled by default in debug and test builds to help catch bugs, and then can either be included in production using the [ReleaseSafe](https://ziglang.org/documentation/master/#ReleaseSafe) build mode, or omitted with [ReleaseFast](https://ziglang.org/documentation/master/#toc-ReleaseFast).

There are plenty of tradeoffs between Zig's approach and Rust's: compile-time costs versus runtime costs, potential runtime panics versus potential code contortions to satisfy the borrow checker, [safe subsets](https://doc.rust-lang.org/nomicon/meet-safe-and-unsafe.html) versus [whole-language tooling](https://zackoverflow.dev/writing/unsafe-rust-vs-zig/)…it's not a straightforward comparison. Still, both approaches have led to high-profile success stories of reliable, memory-safe software in practice.

On the Zig side, [TigerBeetle](https://tigerbeetle.com/) recently underwent a legendarily meticulous [Jepsen report that found only two safety bugs](https://tigerbeetle.com/blog/2025-06-06-fuzzer-blind-spots-meet-jepsen/), neither related to memory safety. TigerBeetle does ReleaseSafe builds in production, whereas [Ghostty](https://ghostty.org/), which has [never had a memory-safety CVE](https://app.opencve.io/cve/?vendor=ghostty), does [ReleaseFast](https://ziglang.org/documentation/master/#toc-ReleaseFast). (If you want to learn more about these projects, I've recorded in-depth conversations with their creators: [Joran Greef on TigerBeetle](https://youtu.be/8br5QcmYq84?si=qi7z2z8nSUKxiWlL) and [Mitchell Hashimoto on Ghostty](https://youtu.be/ljoNEH39lyw?si=fnm0emKYj5eH3sPP).)

In Roc, we're following Ghostty's lead: using Zig's automatic guards in debug and test builds to catch bugs in development, and omitting them in production so our compiler releases run as fast as possible.

This is, of course, not as comprehensive as what Rust's borrow checker gave us in the original compiler. So with that background out of the way…how has the new approach worked out for us so far in practice? How many memory corruption incidents have we seen since rewriting our compiler from Rust to Zig?

## Memory Safety Post-Rewrite

Here's a breakdown of bug reports in [Roc's issue tracker](https://github.com/roc-lang/roc/issues), as classified by Claude Opus 4.8 thanks to some of my free [Claude for Open Source](https://claude.com/contact-sales/claude-for-oss) credits. (I decided not to spend hours manually classifying thousands of issues just for this one table.) Here are the results:

| Type of bug in Roc's compiler | Rust | Zig |
| :---- | :---- | :---- |
| Bug where memory corruption occurred | 21 | 10 |
| Bug where no memory corruption occurred | 2,575 | 421 |
| Total | 2,596 | 431 |

Obviously, the total bug count is much lower for the rewrite. Should we therefore conclude that the Zig-based compiler is "less buggy" than the original? No, it's just younger, so it's been used less\! Nor would it be sensible to compare the percentages and conclude one is "proportionally more memory-safe" than the other; if that were a useful metric, you could make any code "more memory-safe" by introducing bugs.

Now you might be wondering how the Rust-based compiler had any memory corruption bugs at all, let alone more than double the total count of the Zig-based one. Isn't Rust supposed to be memory-safe?

The explanation is simple: this particular Rust code base happens to *be a compiler.*

As foreshadowed earlier, compilers emit machine instructions. When your machine executes those instructions, they can cause memory corruption, resulting in memory corruption bug reports from the people who experienced them. Regardless of which process had the bug—the compiler or compiled program—in both cases the processor only did the bad thing because the compiler told it to. And in both cases the fix is the same: the compiler's code must change, since that code was what caused the memory corruption.

Just like every compiler, ours has had bugs, and some of those have been miscompilations that led to memory corruption. This is where all 21 of the memory corruption bug reports in our original Rust-based compiler came from; none of those bugs occurred in the process of the compiler itself, which is a testament to the borrow-checker working as intended.

In contrast, while 8 of the 10 memory corruption bugs in the Zig-based compiler were also miscompilations, the remaining 2 were in the compiler itself. Both were use-after-free bugs in error reporting, with the same symptom: filenames in error messages ([one in `roc check`](https://github.com/roc-lang/roc/issues/8943) and [the other in `roc bundle`](https://github.com/roc-lang/roc/issues/8606)) rendered as useless [question-mark-in-diamond characters](https://unicodeplus.com/U+FFFD).

Now let's suppose we had instead chosen Rust for our rewrite, or Zig with `ReleaseSafe`. What would have been the impact in practice, holding all else equal?

| Tooling Choice | Memory-safety impact in practice |
| :---- | :---- |
| Zig with `ReleaseFast` | 2 bug reports: some error reports fail to render filenames  |
| Zig with `ReleaseSafe` | 2 bug reports: some error reports panic instead of rendering at all |
| Rust's borrow checker | neither of these bug reports |

After 18 months of development, hundreds of total bug reports, and hundreds of thousands of lines of code, my main takeaway from retrospecting on this table is that picking a different row would have made no appreciable difference to the project. So far our choice has gotten us the outcome we'd hoped for, and if a future retrospective goes differently, switching to `ReleaseSafe` is a build flag away.

As I noted earlier, every project has different needs. When Bun rewrote in the opposite direction—from Zig to Rust—[their accompanying post](https://bun.com/blog/bun-in-rust#just-be-really-smart-and-don-t-make-mistakes) noted:

For Bun, correctly handling the lifetimes of garbage-collected values \[from JavaScript\] and manually-managed values has been a major source of stability issues \- most often small memory leaks and occasionally, crashes. Every memory allocation has to be meticulously reviewed. Where do these bytes get freed? How do we ensure it only gets freed once? Did we check for JavaScript exceptions properly? Is this garbage-collected pointer visible to the conservative stack scanner? Is this garbage collected memory or manually managed memory?

Roc's compiler doesn't have these challenges because it doesn't interface with JavaScript or any other tracing garbage collector. For Bun, "use-after-free, double-free, and 'forgot to free'" errors have been "a large percentage of bugs," whereas errors like these have been a small percentage of Roc's bugs. And of course Roc's compiler faces various challenges that Bun doesn't. Different projects have different needs\!

In our case, I'm not sure how I could look back at what's actually happened and conclude that what we needed was a bigger investment in tooling to prevent memory safety bugs *in the compiler itself.* There's a much stronger case that we would benefit from better tooling to catch memory safety bugs *in our compiled output*, which is out of scope for the borrow checker.

## Build Times

We wanted faster builds from Zig. Did we get them?

Well, the good news is that `zig build --watch -fincremental` can rebuild a change to our current code base in about 35 milliseconds. That's even faster than what we were hoping for when we considered Zig's build speed a selling point for the rewrite\!

The bad news is that Zig's current stable 0.16.0 release has a bug that breaks `-fincremental` on our code base. [The fix](https://codeberg.org/ziglang/zig/pulls/35533) already landed, but to get it we'd have to build on a [nightly 0.17.0 prerelease build](https://ziglang.org/download/) (which has breaking language changes), along with vendoring and upgrading our affected dependencies to 0.17.0. We decided to wait for the next stable release instead.

As of the last commit that had Rust sources in our code base, here's a timing comparison on my Intel desktop machine running Ubuntu 26 for building cold (no cache, but packages downloaded locally) compared to doing an incremental rebuild after making a trivial edit to our parser:

| Roc Compiler Version | LoC | Cold Build | Incremental |
| :---- | :---- | :---- | :---- |
| Original on Rust 1.85.0 | 354K | 32.4s | 10.0s |
| Original on Rust 1.97.0 | 354K | 25.4s | 3.4s |
| Rewrite at feature parity on Zig 0.16.0 | 320K | 39.6s | 8.6s |
| Rewrite today on Zig 0.17.0 | 464K | 32.1s | 0.035s |

(Note that our Zig build configuration as of the feature-parity commit was rebuilding rarely-changing artifacts on every build that we later decided to rebuild only on demand. That's why today's cold builds are faster than they were back at 300K LoC, even though our lines of code have increased by \~50% since then.)

Rust 1.97 is the current stable release today, and 1.85 was the current stable release 487 days ago (the time our rewrite took to reach to feature parity). So if we'd stayed on Rust for the same duration, we could have seen our incremental build times decrease from 10 seconds to 3.4. That's a big jump\! I really appreciate all the hard work that Rust contributors have done to improve build times. Eliminating 2/3 of our incremental build times over 18 months would have been a very welcome change if we'd stayed on Rust, and it's a bigger improvement than I would have expected in an 18-month period. Bravo\!

As impressive as that improvement is, Zig's 35ms is still way ahead. Not only is it 1/100th the build time of 3.4 seconds, it's also in [a different performance category](https://www.youtube.com/watch?v=-jy4HaNEJCo&t=279s)—and that 35ms is on a Zig code base with \~50% more lines of code than the Rust one that got 3.4s. I expect Roc's code base to keep growing, and for this gap to keep growing with it; I've never heard of any initiative on Rust's roadmap comparable to `-fincremental`.

Still, it's a point in Rust's favor that our `cargo build` times after a rebuild (without a watch running) on current stable Rust are now faster than our `zig build` rebuild times on current stable Zig. That number is the relevant comparison for CI build times, as CI builds won't use `--watch -fincremental` at all.

So while our decision to remain on stable 0.16.0 (plus how many of our contributors run Mac laptops with ARM processors; `-fincremental` only works on x86-64 CPUs right now) means we haven't yet reaped the anticipated build-time rewards of choosing Zig for the rewrite, we certainly have something to look forward to in the next stable Zig release\!

## Zero-Parse Deserialization

Roc's on-disk caching system uses a technique I first learned about from Zig's compiler, and which Casey Muratori told me is common practice in game programming. It relies on the happy coincidence that if you're organizing your memory in the way that runs fastest on modern hardware anyway, you can also load it from disk directly into memory and start using it without parsing anything.

Here's how it works:

* When we load a Roc module (a .roc source file), we compute a BLAKE3 hash of its source bytes, and then hash that along with the current version of Roc's compiler. This is the module's "source key."  
  * Parsing and name resolution (aka "semantic analysis" prior to type checking) are designed to be a pure function of source bytes, so we can write these arrays directly to disk under the module's source key and then load them directly back into memory when we're done. There is no parsing step to deserialize, just doing a fixed number of pointer relocations to put the arrays in the right places in memory.  
  * This means we deserialize basically at the speed of loading the bytes from disk into memory, which also means if they're already in the operating system's disk cache, we deserialize at roughly the speed of [memcpy](https://www.man7.org/linux/man-pages/man3/memcpy.3.html).  
  * This is, as you might guess, significantly faster than redoing lexing, parsing, and semantic analysis from scratch. So when we load a source file, we BLAKE3 hash its bytes to get its source key, go look up whether we have an entry in the global cache, and if so, read it into memory, do some pointer relocations, and we're done.  
* Each .roc file also has an "implementation key," which is basically its source key recursively hashed together with the implementation keys of everything it imports.  
  * Type-checking, compile-time execution of constants, and executing tests of pure functions (you can write tests in the top level of .roc files using the `expect` keyword, e.g. `expect my_fn(123, 456) == 789` and they will get run during `roc test`), are all pure functions of a module's implementation key.  
  * We cache these under the implementation key in the same way and with the same deserialization strategy as what we do for the source code.  
    * We use this different key because it can be invalidated if the module's dependencies change, at which point it saves time to be able to go get the cached source key for everything up to type-checking, and not have to redo that work.  
  * So now we don't need to pay to redo type inference, or compile-time evaluation, or even rerun pure-function tests, for a given module. We just get its BLAKE3 hash and load a file into memory, and we're basically done. This is *much* cheaper than doing type inference, compile-time evaluation of constants, and re-running all your tests.

This zero-parse deserialization strategy only works because we use 32-bit array [indices over pointers](https://joegm.github.io/blog/indices-not-pointers/) for all of our compiler data structures. Not only is this faster and more memory-efficient than 64-bit pointers, but if we used pointers (like almost all compilers do), deserialization couldn't be zero-parse.

If you know exactly how many of these array-with-indices collections you need up front, Rust's borrow checker can help you avoid using an index with the wrong array by generating type tags like what [`compact_arena`](https://docs.rs/compact_arena/0.5.0/compact_arena/) does. Unfortunately, if you *can't* know exactly how many you need up front (e.g. because it varies by number of modules, as it does in our use case), the borrow checker can't help. That's why `compact_arena` [marks this functionality as `unsafe`](https://docs.rs/compact_arena/0.5.0/compact_arena/struct.SmallArena.html#method.new).

I certainly agree that `unsafe` is warranted here, but personally I wouldn't label `SmallArena::new` in particular as unsafe. *Creating* an empty arena will never cause memory unsafety, so putting an `unsafe` block around it isn't doing what `unsafe` is supposed to do in Rust: mark the parts of your code that must be audited extra-carefully.

The reality is uncomfortable, but it is reality: what is actually memory-unsafe when you use this technique is *literally every single operation that looks up an index into an array.* Every single "index-flavored pointer dereference" is an opportunity to give the index to the wrong array, and end up with whatever random bytes happened to be in that incorrect array at that particular index. Those are the points of unsafety that need extra-careful auditing.

So if we had adopted this technique pervasively in our Rust code base—as Zig's compiler does, and which we had decided to partly because it's a prerequisite for zero-parse deserialization—then the part of our code base that would use Unsafe Rust and therefore need extra-careful auditing would be *the entire code base.*

[Safe Rust](https://doc.rust-lang.org/nomicon/meet-safe-and-unsafe.html) is valuable because it (reasonably\!) assumes that the amount of Unsafe Rust in your code base is small and isolated, which I believe is true for the vast majority of Rust code bases. But if `unsafe` is going to be pervasive, like in our case, the premise of that value proposition no longer holds, and it starts to sound more appealing to choose [a language that's safer than Unsafe Rust](https://zackoverflow.dev/writing/unsafe-rust-vs-zig/).

## Ecosystem Relevance

Rust creator Graydon Hoare once jokingly described Rust as "Linear ML in C++ clothing." When I first heard that, I assumed the "C++ clothing" he was referring to was syntax, but over time I've increasingly thought of Drop—which is almost a direct translation of RAII—as being part of that "C++ clothing." You could certainly make a Linear ML without Drop if you wanted to\!

Drop makes working in Rust feel, by default, like working in a language with a tracing garbage collector (like Go, or maybe OCaml—the language which Rust's initial compiler was written in). "Garbage-collected, except with lifetime parameters in lots of type signatures, and with an additional borrow checking step on top of the usual type-checking step" is how I felt about using Rust when I was first getting into it.

I can think of two situations where Drop seems like pretty much exactly the right tool for the job. One is where you want to do a lot of automatic reference counting, like in Zed's code base. Manual reference counting is notoriously difficult to get right, and the bugs when you get it wrong are notoriously hard to track down. Automatic reference counting via Drop is way less error-prone.

Another situation where Drop feels like the right tool for the job is when interfacing with a ton of memory that's managed by a tracing collector like JavaScript's—in other words, what Bun is doing. Before ultimately moving to Rust, they mentioned having developed their own "smart pointer" system in Zig to deal with this, but I'd expect Drop to be a much more natural fit for what they wanted to do.

In contrast, Drop has been a pain point for us because the Rust ecosystem is built around it. Imagine these two APIs for a wrapper around LLVM's C++ library:

1. "Call this function and we'll use a global allocator for all allocations, even if you have an arena you want to be used instead."  
2. "Call this function passing an allocator, so if you want to use an arena, no problem, you just pass it in."

Our arena-heavy code base always wants the second API, which Zig's ecosystem consistently follows, whereas basically Rust's whole ecosystem is designed to offer the former API every time. So Rust's ecosystem is optimized for the way Bun wants to be written, whereas Zig's is designed for the way Roc wants to be written.

Separately, there's the question of what code we can access off the shelf. I mentioned LLVM earlier because, although it's a critical dependency for our optimizer (we do our own optimizations, but LLVM does a bunch more on top), it's also a project that makes major breaking API changes on a regular basis. Upgrading to new LLVM versions has been a major source of pain and lost time for Roc, but we keep doing it because we want the new optimizations.

As it turns out, LLVM actually has a stable and backwards-compatible API that can be accessed to bypass this upgrade pain: its serialized "bitcode" format. If you write your own LLVM bitcode serializer, then you can tell each new version of LLVM to consume that, and you're off to the races. 

Of course, to access this strategy, you need a handwritten LLVM bitcode serializer that's decoupled from the LLVM C++ library and its breaking changes. I only know of one implementation of such a thing in the wild: Zig's compiler, which of course is written in Zig. And now there are two implementations in the wild, because Roc's new compiler is reusing that same Zig code. (Thanks for sharing it, Zig team\!)

Future considerations are relevant here too. Right now our final compiler executable is about 25MB of our own stuff and then over 100MB of LLVM and lld. They also both run very slowly, but today there's no viable alternative out there which does those jobs.

I only know of one project that aims to replace both of those dependencies with fast, modern alternatives. Any guesses? Yeah, it's the Zig team. They want it for their own compiler, for the same reasons we do, and there's no Rust equivalent I've ever heard of being developed.

You might have noticed that the biggest source of dependencies we're interested in from the Zig ecosystem is the Zig compiler itself. This is unusual, but Roc is an unusual project with unusual needs. When I wrote the first line of code in the compiler back in 2019, I would not have guessed that the following would prove true: "In the future, the richest gold mine of reusable code for this project will be an open-source compiler written in a language you haven't heard of yet."

Life is full of surprises\!

## Things I Miss From Rust

Even though I'm no longer using Rust for Roc, I remain immersed in the Rust world because I work at [Zed](https://zed.dev/), where we use it for pretty much everything. So when I say I miss something from Rust when building with Zig (or vice versa), it's not just rose-tinted memories of a distant past; it's more like memories from earlier in the same day.

Something I was surprised to find myself missing from Rust is automatic allocation and deallocation in *tests.*

As discussed earlier, having full control over allocations and deallocations is what I want in our compiler's implementation. And in tests, I also appreciate the testing allocators detecting leaks—it can even detect leaks in compiled Roc code\! Unfortunately, to get that benefit requires a lot of "init this, defer deinit" code in tests that has to be correct or else the test fails on a memory leak. None of that is necessary in Rust. I care more about the compiler's implementation being the way I want it than the tests looking nicer, but in a perfect world I could somehow have both.

Both [parametric polymorphism](https://en.wikipedia.org/wiki/Parametric_polymorphism) and [ad hoc polymorphism](https://en.wikipedia.org/wiki/Ad_hoc_polymorphism) overlap with `comptime`, so it makes sense that Zig doesn't have them, but I do miss them. For example, Rust's [Allocator trait](https://doc.rust-lang.org/std/alloc/trait.Allocator.html) has its allocate function taking "self" at its first argument, whereas in Zig, allocator implementations [like ArenaAllocator](https://github.com/ziglang/zig/blob/738d2be9d6b6ef3ff3559130c05159ef53336224/lib/std/heap/arena_allocator.zig#L185-L186) need to receive an `anyopaque` pointer and then cast it to itself. 

I also miss private struct fields. I understand the reasoning for not having them, but I miss getting a compile error if I use something that is marked as "not supposed to be accessed directly like this, even though it can be done if you really want to." This comes up when reviewing a diff, because in the diff I just see the field access; I don't see the docs on the original struct definition, and I don't want to go out of my way to look them up defensively every time.

Occasionally I miss functions and variables and constants all using `snake_case`.

I do miss aspects of `unsafe` and the borrow checker, even though their upsides come packaged with downside I don't miss. I don't think Zig should add either of these, but at the same time there is something calming about only worrying about certain classes of problems inside `unsafe` blocks. I can miss that feeling even while not wanting to pay the corresponding costs in this project.

I'm not sure how much of this is because of the way `comptime` works, but I certainly find myself being surprised to discover dead code in our Zig code base (which was caught by neither Zig's built-in tooling nor [TigerBeetle's tidy.zig](https://github.com/tigerbeetle/tigerbeetle/blob/97c7a8ef385270ebe0e1b75959d3d21d134629df/src/tidy.zig)—by the way, thanks for open-sourcing that, TigerBeetle team\!) more often than I'm used to from Rust. Dead Zig code doesn't affect end users because the compiler doesn't even emit it into the binary, but obviously it would be better for our code base if we discovered it earlier. 

Finally, the Rust team does an admirable job with backwards compatibility in their releases. Upgrading to new minor releases barely took any effort, and even edition upgrades were mostly painless. Backwards-compatibility is a non-goal for Zig in its current stage of development, which is something we knew about going in and expected. It hasn't been a big problem for us, but do I miss the trivial upgrade process we had in Rust? Of course\!

## Things I Enjoy About Zig

I've always enjoyed the *subtractive* aspect of functional programming. You'd think that subtracting tools from my toolbox that I'm accustomed to reaching for (e.g. mutation, unrestricted side effects, objects and classes) would be frustrating…but once I got used to the different techniques, I really came to enjoy the new properties I had unlocked (cacheability, non-flaking tests, concurrency niceties, reordering operations with no fear that their outputs might change, etc.) and no longer wanted to give *those* up.

I have similar feelings about Zig. I like that it doesn't have macros. I may miss ad hoc polymorphism, but at the same time I enjoy how many problems (including parametric polymorphism) can be addressed by comptime and/or an ordinary function.

I love the control over data layouts. It's great having out-the-box access to number types that aren't a power of 2, like [u7 and u5](https://github.com/roc-lang/roc/blob/012eb3d50f3cd0673a653e1b9bc4f653dbee1eb2/src/builtins/dec.zig#L93-L96), without having to do any bit-level work myself. [Packed structs](https://github.com/roc-lang/roc/blob/012eb3d50f3cd0673a653e1b9bc4f653dbee1eb2/src/base/Ident.zig#L102) out-the-box, the option to inline functions at the call site instead of the declaration site…these are things you can get from Rust crates using macros, but I really like having them available without needing a separate dependency.

Zig's build toolchain is second to none, which is presumably [why Uber uses it](https://www.uber.com/us/en/blog/bootstrapping-ubers-infrastructure-on-arm64-with-zig/) even though they don't use Zig the language. Building self-contained binaries for things like Alpine Linux and WebAssembly has gone really well, even though we're doing weird stuff like compiling part of our code base (the "builtins"—Roc's standard library, essentially) into an opaque binary blob and including it in the final executable.

I also really like [Zig's error-handling strategy](https://ziglang.org/documentation/0.16.0/#Switching-on-Errors), and especially how failed heap allocations are normal userspace errors. Roc has a similar "errors naturally accumulate" strategy (except using anonymous sum types that can have payloads), and I like both of those strategies better than [anyerror](https://docs.rs/anyhow/latest/anyhow/), [thiserror](https://docs.rs/thiserror/latest/thiserror/), or vanilla no-dependency error handling in Rust with [Result](https://doc.rust-lang.org/std/result/enum.Result.html). (That said, I do prefer Rust's postfix unary ? operator over Zig's `try` keyword, which is why we adopted the postfix unary ? operator in Roc.)

Then of course there's all the project-specific stuff which I mentioned earlier: allocator-based APIs everywhere, an ecosystem of high-performance compiler goodies that we can't find anywhere else, and so on. I won't rehash them all here, but I very much enjoy them in addition to appreciating the benefits they've had to the project.

I've had a very positive experience with Zig all around, and looking back I'm really happy that we chose it for our rewrite\!

## What's Next for Roc

Next up we're working towards a formal 0.1.0 release of the language, aiming to have it out before the end of this year. I have a lot of documentation to write\!

By the way, the [Roc Programming Language Foundation](https://roc-lang.org/foundation) is a [501(c)(3) nonprofit](https://en.wikipedia.org/wiki/501\(c\)\(3\)_organization), so [donations](https://roc-lang.org/donate) are tax-free in the US, and we use donations primarily to compensate contributors. If you know of an organization that would like to sponsor our work, financially or in other ways, please [get in touch](https://roc-lang.org/donate)\! (Separately, if you know anyone at GitHub who could get us into [GH for Nonprofits](https://github.com/solutions/industry/nonprofits), that would be a huge help with our CI backlog.)

Thank you again to everyone who has helped the language reach this milestone. I couldn't be more excited for the next one: our first-ever numbered release\!
