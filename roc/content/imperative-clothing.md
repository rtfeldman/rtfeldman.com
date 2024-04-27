<h1>Functional Semantics <span class="nowrap">in Imperative</span> Clothing</h1>
<aside class="timestamp">Posted on <time datetime="2023-04-21">April 23, 2024</time></aside>
<hr>

There's an old joke about programming with pure functions:

<blockquote>“Eventually you have to do some effects. Otherwise you're just <span class="nowrap">heating up the CPU.”</span></blockquote>

I've always wanted the purely functional [Roc programming language](https://www.roc-lang.org/) to be delightful for I/O-heavy use cases. But when I recently sat down to port an I/O-heavy shell script from Bash to Roc, I wasn't happy with how the code felt.

Fortunately, all it took was a bit of syntax sugar to change that. Thanks to one little operator, purely functional I/O in Roc has now become a real delight!

## From Bash to Roc

The shell script in question assembles some static assets for the [roc-lang.org](http://roc-lang.org) website. Here's part of the Bash version of the script:

```bash
cp -r public/ build/

# If this is set, assume we're on a Netlify build server
if [ -v GITHUB_TOKEN ]; then
    echo 'Fetching latest roc nightly...'
    # get roc release archive
    curl -fOL https://github.com…
    # extract archive
    ls | grep "roc_nightly" | xargs tar -xzvf
    # delete archive
    ls | grep "roc_nightly.*tar.gz" | xargs rm
    roc='./roc_nightly/roc'
else
    # build the \`roc\` CLI from source
    cargo build --release
    roc=target/release/roc
fi

$roc --version

echo 'Building site markdown content'

$roc run www/main.roc www/content/ www/build/
```

Here's how this code can now look in Roc, thanks to the new syntax sugar that our awesome contributor [Luke Boswell](https://github.com/lukewilliamboswell/) recently implemented: the `!` suffix.

```roc
Dir.copyAll! "public/" "build/"

pathToRoc =
    # If this is set, assume we're on Netlify
    if Result.isOk (Env.var! "GITHUB_TOKEN") then
        Stdout.line! "Fetching latest roc nightly..."

        # get roc release archive
        filename = "nightly.tar.gz"
        Http.download! "https://github.com…" filename
        Cmd.exec! "tar" ["-xzvf", filename]
        # delete archive
        File.removeIfExists! filename

        "./roc_nightly/roc"
    else
        # build the `roc` CLI from source
        Cmd.exec! "cargo" ["build", "--release"]

        "target/release/roc"

roc = \args -> Cmd.exec! pathToRoc args

roc! ["--version"]

Stdout.line! "Building site markdown content"

roc! ["www/main.roc", "www/content/", "www/build/"]
```

I really like how this reads! It looks totally imperative, which is a nice fit for a script that's doing lots of I/O and not much else.

In fact, it's so visually similar to the Bash version, you might not even guess that the Roc version desugars to a big pile of 100% statically type-checked pure functions.

It's functional semantics in imperative clothing!

## Desugaring the Sugar

To explain how this imperative-looking code can actually be compiling down to nothing but pure functions, I need to start by explaining how the ! suffix works.

It's very similar to the await keyword in other languages. For example, this line…

```roc
if Result.isOk (Env.var! "GITHUB_TOKEN") then
```

…might look like this in JavaScript:

```typescript
if (Result.isOk(await Env.var("GITHUB_TOKEN"))) {
```

Before we had the `!` suffix, code like this didn't look nearly as nice. The closest we had was [backpassing](https://web.archive.org/web/20240329162732/https://www.roc-lang.org/tutorial%23backpassing), which was unhelpful in nested expressions; this one line would probably have been two lines instead:

```roc
result <- Env.var "GITHUB_TOKEN" |> Task.await

if Result.isOk result then
```

Even when conditionals weren't involved, seeing `<-` for some assignments and `=` for others, plus lots of `|> Task.await`, wasn't nearly as nice as the style we have now.

It might look like a minor difference when comparing one small line to another, but multplied across the whole program, the <code>!</code> version of the script felt much nicer.

So what does the `!` suffix actually do? It basically desugars into two things:

1.  A call to `Task.await`
2.  An anonymous function which gets passed to that `Task.await` call

Let's walk through an example.

```roc
html = Http.getUtf8! url
path = Path.fromStr filename
File.writeUtf8! path html
Stdout.line! "Wrote HTML to: $(filename)"
```

This desugars to the following Roc code.

```roc
Task.await (Http.getUtf8 url) \html ->
    path = Path.fromStr filename
        Task.await (File.writeUtf8 path html) \_ ->
        Stdout.line "Wrote HTML to: $(filename)"
```

If you wanted to, you could have written the code this way and it would have compiled to exactly the same program! Going line by line:

```roc
html = Http.getUtf8! url
```

…becomes:

```roc
Task.await (Http.getUtf8 url) \html ->
```

The `Task.await` function plays a similar role as the `await` keyword in other languages: it says "wait until this `Task` successfully completes, then pass its output to a function." (A `Task` in Roc is a value that represents an asynchronous effect; the `Http.getUtf8` function returns a `Task`.)

Tasks can be chained together using the `Task.await` function, similarly to how JavaScript Promises can be chained together using a Promise's [`then()` method](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then). (You might also know functions in other languages similar to `Task.await` which go by names like `andThen`, `flatMap`, or `bind`.)

The next line in our example was `path = Path.fromStr filename`, but that line was unchanged since it didn't use `!` at all. The next `!` was in this line:

```roc
File.writeUtf8! path html
```

It desugars to:

```roc
Task.await (File.writeUtf8 path html) \_ ->
```

Notice that here, since we didn't have `html =` at the start (because we don't care about the output of a file write), we also didn't have the named argument `\html ->` in the function being passed to `Task.await`. Instead we had `\_ ->`, which is how in Roc we write a function that ignores its argument.

It's worth noting that both `Http.getUtf8` and `File.writeUtf8` are operations that can fail. If they do, the whole chain of tasks will short-circuit to some error-handling code. That's part of what `Task.await` has always done, and the `!` sugar doesn't affect error handling at all.

Finally, we had:

```roc
Stdout.line! "Wrote HTML to: $(filename)"
```

This desugars to:

```roc
Stdout.line "Wrote HTML to: $(filename)"
```

Since this is the last task in a chain, the ! doesn't do anything and isn't necessary…so we just drop it during desugaring instead of giving a compiler error or generating an unnecessary Task.await. This allows for a more consistent visual style, where async I/O operations always end in the `!` suffix, but doesn't have any runtime cost.

## I/O from Pure Functions

Earlier I said that this style of Roc code "desugars to a big pile of 100% statically type-checked pure functions."

The 100% statically type-checked part is easy to explain: Roc has full type inference, so your types always get checked, but you never need to write type annotations. You can optionally add annotations anywhere you think they'll be helpful, but for this shell script I didn't think they'd be worth including. (For Roc programs that aren't shell scripts, the common practice is to annotate all top-level functions and that's usually about it.)

What about the "all pure functions" part? By definition, pure functions don't have side effects, right? (A [side effect](<https://en.wikipedia.org/wiki/Side_effect_(computer_science)>) is when a function changes some state outside the function itself, like a global variable or the file system.) So…how can these functions be pure if all this I/O is happening?

It's surprisingly simple:

1.  Each function returns a value describing what I/O it wants done.
2.  The compiled program has a runtime which looks at those values and actually performs the I/O they describe.

There are practical benefits to separating things this way (more on those later), but to illustrate what's happening behind the scenes here, let's go back to that example from earlier:

```roc
html = Http.getUtf8! url
path = Path.fromStr filename
File.writeUtf8! path html
Stdout.line! "Wrote HTML to: $(filename)"
```

We already went through how that code desugars to this code:

```roc
Task.await (Http.getUtf8 url) \html ->
path = Path.fromStr filename
Task.await (File.writeUtf8 path html) \_ ->
Stdout.line "Wrote HTML to: $(filename)"
```

This code in turn compiles down to something which looks similar to the following at runtime. (I'm using JavaScript syntax here rather than Roc, which will be convenient in the next example.)

```typescript
{
  operation: "Http.getUtf8",
  args: [url],
  afterwards: (html) => {
    const path = Path.fromStr(filename)

    return {
      operation: "File.writeUtf8",
      args: [path, html],
      afterwards: () => {
        operation: "Stdout.line",
        args: [`Wrote HTML to ${filename}`],
        afterwards: () => { operation: "done" }
      }
    }
  }
}
```

Nothing but nested object literals where one field is a function that returns another object literal. No side effects anywhere! (This structure isn't exactly how Roc represents `Task` values in memory—the operation isn't a string, for example—but let's go with it for simplicity's sake.)

## Implementing a Runtime

Now let's look at how a runtime can translate those nested object literals into I/O.

In [Node.js](https://nodejs.org) I could do this by writing a loop which:

- Starts with one of these "Task" values to run
- Looks at the task's operation field and performs the requested I/O operation
- Calls the function in the task's afterwards field, passing the output of that I/O operation. (This function will return another Task value.)
- Loops back to the start to repeat this process until we encounter a Task whose operation field is "done", which tells us we're done.

Here's how that would look in code:

```typescript
while task.operation != "done" {
  if task.operation == "Http.getUtf8" {
  const [url] = task.args
  const response = httpRequest(url)

    task = task.afterwards(response.text())
  } else if task.operation == "File.writeUtf8" {
  const [path, content] = task.args
    fs.writeFileSync(path, content)

    task = task.afterwards()
  } else if task.operation == "Stdout.line" {
  const [line] = task.args
    console.log(line)

    task = task.afterwards()
  }
}
```

Although this would work, Node encourages doing asynchronous I/O instead of synchronous like we've done here.

Fortunately, one of the benefits of representing effects as values that hold "afterwards" [continuation](https://en.wikipedia.org/wiki/Continuation) functions like this is that the Task value can also be translated into async I/O. Here's the same Node code done in an asynchronous callback style instead—and using recursion instead of a while loop.

```typescript
const interpretTask = (task) => {
  if task.operation == "Http.getUtf8" {
    const [url] = task.args

    fetch(url, (response) => {
      const text = response.text()

      const nextTask = task.afterwards(text)
      return interpretTask(nextTask)
    })
  } else if task.operation == "File.writeUtf8" {
    const [path, content] = task.args

    fs.writeFile(path, content, () => {
      const nextTask = task.afterwards()
      return interpretTask(nextTask)
    })
  } else if task.operation == "Stdout.line" {
  const [line] = task.args
    console.log(line)

    const nextTask = task.afterwards()
    return interpretTask(nextTask)

  } else if task.operation == "done" {
    // Don't recurse. We're done!
  }
}
```

The actual I/O can be implemented in any number of styles. Promises, for example. Or async/await. Outside of JavaScript, it could be done with high-performance low-level async I/O operating system primitives like [io_uring](https://en.wikipedia.org/wiki/Io_uring) in C, Zig, or Rust—including inside async runtimes like [Tokio](https://tokio.rs/).

Separating these I/O descriptions from the runtime that performs the actual I/O lets you drop in whatever async I/O runtime system you want, without having to change your application code at all!

In fact, one of the main motivations for representing effects as values like this is so that future [Roc platforms](https://www.roc-lang.org/platforms) can do all this "traversing the data structure" work behind the scenes to quietly give you excellent async I/O performance that's potentially even tailored to a particular domain (e.g. web servers, CLIs, games), while your application code gets to look as straightforward as it would in any imperative language:

```roc
html = Http.getUtf8! url
path = Path.fromStr filename
File.writeUtf8! path html
Stdout.line! "Wrote HTML to: $(filename)"
```

Platform authors can also use this representation to offer features like "dry-run mode" in which all the requests for disk I/O are performed on a fake in-memory filesystem (perhaps using the current state of the real filesystem for its initial structure) so that scripts can be tried out without their "I/O operations" affecting the actual disk. Or automatic logging of all I/O operations, with the application code specifying the logging system to use. The list goes on!

Besides platforms being able to apply different I/O runtimes to the same application, the functional semantics underneath the sugar have benefits for application authors too. For example, they unlock nicer testability.

## Testability

We've seen how individual functions can be pure while resulting in an overall program that does I/O. But at the end of the day, if the code is just resulting in the I/O being performed anyway, what could possibly make it easier to test?

The key is that we can run a test on the value being returned, instead of handing it off to the runtime. That means no actual I/O gets performed, and the test is completely deterministic—yet all of the actual logic around the I/O can be tested!

For example, here's a test I can write using only Task values:

```roc
expect task.operation == "Http.getUtf8"
expect task.args == ["example.com/something"]

fakeResponse = "<html><body>testing!</body></html>"
next = task.afterwards [fakeResponse]

expect next.operation == "writeUtf8"
expect answer.args == [filename, fakeResponse]
```

This test will run extremely quickly, and it will never flake. All it does is look at values!

I could also write a property test to randomly run this a bunch of times with random inputs and verify that (for example) no matter what lines are in the files, the output has commas there instead. I could simulate that a third-party server I have no control over is timing out, or returning 500 errors, and verify that my application is handling that correctly…all without actually contacting that server!

(By the way, you can already write tests in Roc using the built-in expect keyword and the roc test CLI command, although writing simulation-style tests of Tasks relies on a language feature that hasn't been fully implemented yet. I plan to write about that after it ships!)

Of course, many programming languages have ways to test logic without actually running I/O, such as [monkey patching](https://en.wikipedia.org/wiki/Monkey_patch), mocking, and so on. What I like about this "simulation" style is that I don't have to guess which APIs need to be monkey patched, I don't have to make my implementation more generic than I want it to be (just so I can swap in [doubles](https://en.wikipedia.org/wiki/Test_double) for testing), and the simulation works just fine even if third-party packages are involved in assembling the Task values.

To be fair, any language can benefit from representing effects as values without going as far as to make all functions in the language pure, but there are [separate practical benefits to having all functions be pure](https://youtu.be/3n17wHe5wEw). Some of the other benefits take longer to explain than testability, so I'll stick to just that one example in this article…but I'd like to write more about some of the others in the future!

## Trying Out Roc

If you're intrigued by this "functional semantics in imperative clothing" idea and want to give [Roc](https://www.roc-lang.org/) a try for yourself, the [tutorial](https://www.roc-lang.org/tutorial) is the easiest way to get up and running. It takes you from no Roc experience whatsoever to building your first program, while explaining language concepts along the way.

I also highly recommend dropping in to say hi on [Roc Zulip Chat](https://roc.zulipchat.com/). There are lots of friendly people on there, and we love to help beginners get started with the language!

Finally, if you'd like to meet up with a bunch of Roc enthusiasts in person, there will be 3 different Roc talks at [Software You Can Love 2024](https://sycl.it/) in Milan this May, and we expect it to be the largest in-person gathering of Roc programmers to date. It's going to be amazing!
