[![JSR](https://jsr.io/badges/@okikio/undent)](https://jsr.io/@okikio/undent)
[![JSR Score](https://jsr.io/badges/@okikio/undent/score)](https://jsr.io/@okikio/undent/score)
[![npm](https://img.shields.io/npm/v/@okikio/undent)](https://www.npmjs.com/package/@okikio/undent)
[![CI](https://github.com/okikio/undent/actions/workflows/ci.yml/badge.svg)](https://github.com/okikio/undent/actions/workflows/ci.yml)

# undent

Strip source-code indentation from template literals and strings. Built for Deno, Node.js, Bun, etc... Works everywhere JavaScript runs.

Indented code is readable code. But template literals carry that indentation
straight into the output:

```ts
function greet(name: string) {
  return `
    Hello, ${name}!
    Welcome aboard.
  `;
}

console.log(greet("Ayo"));
```

The output looks weird because of the leading spaces:

```

    Hello, Ayo!
    Welcome aboard.

```

You could smash the template to column 0, but then your code becomes unreadable. 

```ts
function greet(name: string) {
  return `
Hello, ${name}!
Welcome aboard.
  `;
}

console.log(greet("Ayo"));
```

> TL;DR: it looks kinda ugly...plus it messes up code folding in some editors.

`undent` fixes this issues by letting you write nicely indented templates without the extra spaces in the output:

```ts
import { undent } from "@okikio/undent";

function greet(name: string) {
  return undent`
    Hello, ${name}!
    Welcome aboard.
  `;
}

console.log(greet("Ayo"));
```

```
Hello, Ayo!
Welcome aboard.
```

It finds the shared indentation across all lines, strips it, and trims the blank
lines that come from the backtick placement. Beyond that, it handles several
things most dedent libraries get wrong:

- **Preserves newline styles** — `\n`, `\r\n`, and `\r` pass through
  byte-for-byte, never silently normalized
- **Aligns multi-line interpolations** — when a `${value}` spans multiple lines,
  subsequent lines stay pinned to the insertion column
- **Composes templates** — embed one template inside another without indentation
  drift
- **Works on plain strings** — `.string()` handles SQL files, config snippets,
  and anything without template structure

## Install

```ts
// Deno — import directly from JSR
import { undent } from "jsr:@okikio/undent";
```

```bash
# Add to your deno.json import map
deno add jsr:@okikio/undent
```

```bash
# Node / Bun — npm registry
npm install @okikio/undent
# pnpm add @okikio/undent
# yarn add @okikio/undent
# bun add @okikio/undent
```

```bash
# Node / Bun — JSR bridge (alternative, no npm account needed)
npx jsr add @okikio/undent
# pnpm dlx jsr add @okikio/undent
# yarn dlx jsr add @okikio/undent
```

## Usage

Use `undent` as a tagged template literal. It finds the shared leading
whitespace, strips it, and trims the wrapper blank lines:

```ts
import { undent } from "@okikio/undent";

const sql = undent`
  SELECT id, name
  FROM   users
  WHERE  active = true
`;

console.log(sql);
// SELECT id, name
// FROM   users
// WHERE  active = true
```

Relative indentation within the content is preserved — only the common leading
whitespace is removed:

```ts
const config = undent`
  server:
    host: localhost
    port: 8080
  logging:
    level: debug
`;

// server:
//   host: localhost       ← 2-space indent kept
//   port: 8080
// logging:
//   level: debug
```

Tabs and spaces both count as indentation characters. `undent` compares mixed
indentation by raw leading character count, not by visual tab stops, so a line
that starts with `"\t  "` and a line that starts with `"  \t"` both contribute
three indentation characters. If you need a fixed baseline in a mixed-indented
template, normalize the source indentation first or use `undent.indent`. If
your goal is visual alignment for interpolated values in a terminal or editor,
use the Unicode-aware `columnOffset` helpers from `@okikio/undent/unicode`.

### Plain strings

When you have a string that isn't a template literal — loaded from a file,
returned from a function, built at runtime — use `.string()`:

```ts
const loaded = readFileSync("query.sql", "utf8");
const clean = undent.string(loaded);
```

There's also a standalone `dedentString` function if you don't need an instance:

```ts
import { dedentString } from "@okikio/undent";

const clean = dedentString(`
    SELECT *
    FROM users
`);
// "SELECT *\nFROM users"

dedentString("\t  alpha\n  \tbeta");
// "alpha\nbeta"
// Mixed tabs/spaces are stripped by raw leading character count.
```

### Multi-line values

When you interpolate a multi-line value, regular string concatenation breaks the
visual alignment. The first line lands at the insertion point, but every line
after it snaps back to column 0:

```ts
const items = "- alpha\n- beta\n- gamma";

const result = undent`
  list:
    ${items}
  end
`;
// list:
//   - alpha
// - beta        ← snapped to column 0
// - gamma
// end
```

`align()` fixes this. It pads every subsequent line of the value to match the
column where it was inserted:

```ts
import { align, undent } from "@okikio/undent";

const items = "- alpha\n- beta\n- gamma";

undent`
  list:
    ${align(items)}
  end
`;
// list:
//   - alpha
//   - beta       ← stays at column 2
//   - gamma
// end
```

By default, that insertion column is measured with JavaScript string offsets
after the last newline. That is fast and stable for code generation, but it is
not the same thing as visual width in a terminal or editor. Tabs, combining
marks, emoji, and full-width characters can render at different visual columns
than their UTF-16 length suggests.

### Choosing the right mode

Use the default mode when you want structural dedenting, the indent anchor when
you want to choose the baseline yourself, and the Unicode helpers when aligned
values need to follow rendered columns instead of raw string length.

| Tool | Best for | What it measures |
| --- | --- | --- |
| `undent` | Normal template and string dedenting | Shared leading whitespace characters |
| `undent.indent` | Templates that need an explicit left margin | The anchor's source indentation column |
| `createUnicodeColumnOffset()` | Alignment in terminals/editors with tabs, emoji, or wide characters | Visual columns after the last newline |

When you want alignment to follow rendered columns instead of raw string
length, switch to the Unicode-aware mode from `@okikio/undent/unicode`:

```ts
import { undent } from "@okikio/undent";
import { createUnicodeColumnOffset } from "@okikio/undent/unicode";

const terminalUndent = undent.with({
  alignValues: true,
  columnOffset: createUnicodeColumnOffset({ tabWidth: 4 }),
});

terminalUndent`
	items:\t${"alpha\nbeta"}
`;
// "items:\talpha\n        beta"
// The second line lines up with the same visual column after the tab stop.
```

When the value itself carries baked-in indentation — a SQL snippet from another
file, a code block from a constant — use `embed()`. It strips the value's own
indentation first, then aligns it at the insertion column:

```ts
import { embed, undent } from "@okikio/undent";

const snippet = `
    SELECT id, name
    FROM   users
    WHERE  active = true
`;

undent`
  query:
    ${embed(snippet)}
`;
// query:
//   SELECT id, name
//   FROM   users
//   WHERE  active = true
```

If every interpolated value in a template needs alignment, turn it on globally
instead of wrapping each one:

```ts
const u = undent.with({ alignValues: true });

const a = "line 1\nline 2";
const b = "value A\nvalue B";

u`
  first:  ${a}
  second: ${b}
`;
// first:  line 1
//         line 2
// second: value A
//         value B
```

> `align()` and `embed()` always align regardless of the `alignValues` setting —
> they're the per-value opt-in.

### Unicode visual alignment

If you need terminal-style Unicode alignment, opt into the separate Unicode
helpers subpath instead of changing the default behavior for every caller:

```ts
import { undent } from "@okikio/undent";
import { createUnicodeColumnOffset } from "@okikio/undent/unicode";

const terminalUndent = undent.with({
  alignValues: true,
  columnOffset: createUnicodeColumnOffset({ tabWidth: 4 }),
});

terminalUndent`
  label: 界 ${"alpha\nbeta"}
`;
// label: 界 alpha
//          beta
```

This mode is still best-effort. Visual width depends on the renderer, font, and
surrounding context, so `@okikio/undent/unicode` aims at common terminal-style
output rather than browser-perfect layout.

### Trimming

By default, `undent` removes all blank lines at the start and end of the output
— the newline after the opening backtick and the whitespace-only line before the
closing one. The `trim` option gives you control:

| Value                   | What it does                                 |
| ----------------------- | -------------------------------------------- |
| `"all"` _(default)_     | Remove all leading and trailing blank lines  |
| `"one"`                 | Remove at most one blank line from each end  |
| `"none"`                | Keep everything, including the wrapper lines |
| `{ leading, trailing }` | Control each side independently              |

```ts
const keepWrappers = undent.with({ trim: "none" });

keepWrappers`
  hello
`;
// "\nhello\n"

const asymmetric = undent.with({
  trim: { leading: "none", trailing: "all" },
});

asymmetric`
  hello
`;
// "\nhello"
```

### Indent detection

`undent` supports two strategies for deciding how much whitespace to strip:

**Common indent** _(default)_ scans every content line and strips the smallest
shared indent. This is the safest choice:

```ts
undent`
  line one
    indented deeper
  line three
`;
// "line one\n  indented deeper\nline three"
//
// 2 spaces stripped from every line.
// The deeper line keeps its extra 2 spaces of relative indent.
```

**First-line indent** uses the first content line as the reference point. This
matches the behavior of the `outdent` npm package and is available via the
pre-built `outdent` export:

```ts
import { outdent } from "@okikio/undent";

outdent`
  first line sets the indent
    deeper line stays deeper
`;
// "first line sets the indent\n  deeper line stays deeper"
```

You can also configure this on any instance:

```ts
const firstLine = undent.with({ strategy: "first" });
```

### Custom instances

`.with()` creates a new instance with different settings. The original is never
mutated, so you can layer configurations safely:

```ts
const base = undent.with({ newline: "\n" }); // normalize newlines to LF
const strict = base.with({ trim: "none" }); // also keep wrapper lines
const sql = base.with({ strategy: "first" }); // first-line detection
```

The `newline` option replaces every `\n`, `\r\n`, and `\r` in template segments
with the string you specify. Set it to `null` (the default) to preserve original
sequences. Interpolated values are never affected.

To build an instance from scratch instead of deriving from `undent`:

```ts
import { createUndent } from "@okikio/undent";

const myTag = createUndent({
  strategy: "first",
  trim: "one",
  newline: "\n",
});
```

**Pre-built instances:**

| Export    | Strategy   | Trim    | Notes                          |
| --------- | ---------- | ------- | ------------------------------ |
| `undent`  | `"common"` | `"all"` | Default export                 |
| `outdent` | `"first"`  | `"one"` | Matches `npm:outdent` behavior |

> `dedent` is also exported as a convenience alias for `undent`.

### Indent anchors

The anchor's column position becomes the indent baseline. Content at the
anchor's column becomes column 0 in the output; content deeper than the anchor
keeps its relative spacing. This gives you explicit control instead of relying
on automatic detection:

```ts
class Generator {
  emit(name: string) {
    // Anchor and content at the same column → output at column 0:
    return undent`
      ${undent.indent}
      export function ${name}() {
        // implementation
      }
    `;
    // "export function hello() {\n  // implementation\n}"
  }
}
```

Content deeper than the anchor preserves its offset:

```ts
function indentedOutput() {
  return undent`
    ${undent.indent}
      if (ready) {
        run();
      }
  `;
  // Content is 2 deeper than anchor → 2-space indent preserved:
  // "  if (ready) {\n    run();\n  }"
}
```

## How it works

Tagged templates give `undent` a structural advantage. JavaScript splits
template literals into two parts — static segments (the text between `${}`) and
interpolated values. `undent` only processes the segments; your values pass
through untouched:

```
template literal
       │
       ├─ segments ─▶ detect indent ─▶ strip ─▶ trim ends ─▶ normalize
       │                                                         │
       ├─ values ────────────────── (untouched) ─────────────────┤
       │                                                         │
       └─────────────────────────── join ◀───────────────────────┘
                                     │
                                  result
```

Processed segments are cached by the `TemplateStringsArray` identity — the
frozen array JavaScript creates once per call site. Repeated calls to the same
tagged template pay no processing cost after the first run.

For plain strings (`.string()` and `dedentString()`), there's no segment
structure to exploit. Instead, `undent` scans every line for the minimum indent,
strips it, and trims wrapper blank lines. Original newline sequences are
preserved byte-for-byte.

## Why repeated renders stay fast without mixing layouts

`undent` caches repeated work so common rendering paths stay fast without
mixing together results that belong to different layouts.

That matters most in the boring, repetitive cases that show up in real code:

- the same tagged template runs inside a loop
- the same SQL snippet is embedded in several places
- the same multi-line value is rendered at the same few columns again and again

The benefit is simple: repeated renders avoid recomputing the same stripped or
aligned text. The design question is the important part: what gets reused, and
what must stay separate so one render does not affect another?

### Different kinds of input reuse different cached work

One tagged template call site is the easiest place to see the benefit:

```ts
for (const name of names) {
  undent`
    Hello, ${name}!
    Welcome aboard.
  `;
}
```

JavaScript reuses the same `TemplateStringsArray` for that exact template call
site. Only the `${name}` value changes from one loop iteration to the next. The
static text stays the same, so `undent` reuses the processed segments after the
first render and keeps the hot path cheap.

Multi-line wrappers have a different repetition pattern:

```ts
const snippet = `
    SELECT id, name
    FROM users
`;

undent`
  query:
    ${embed(snippet)}
`;

undent`
  sql:
        ${embed(snippet)}
`;
```

Both calls use the same raw snippet, but not the same insertion column. Later
lines therefore need a different amount of padding in each case:

```text
query:
  SELECT id, name
  FROM users

sql:
    SELECT id, name
    FROM users
```

`undent` keeps those cases separate by using a few small caches with different
boundaries instead of one global cache for everything:

```text
render shape
   │
   ├─ same tagged template call site
   │      undent`Hello, ${name}!`
   │            │
   │            ▼
   │      ┌──────────────────────────────────┐
   │      │ processed-segment cache          │
   │      │ key: TemplateStringsArray        │
   │      └──────────────────────────────────┘
   │
   ├─ same wrapped aligned value
   │      align(value)
   │            │
   │            ▼
   │      ┌──────────────────────────────────┐
   │      │ per-wrapper aligned-text cache   │
   │      │ key: wrapper object identity     │
   │      └──────────────────────────────────┘
   │
   └─ same embedded snippet at one column
      embed(snippet)
        │
        ▼
      ┌──────────────────────────────────┐
      │ bounded shared embed cache       │
      │ key: dedented text + exact pad   │
      └──────────────────────────────────┘
```

The diagram shows the main idea: each kind of repeated work has its own cache
boundary and its own key. That separation keeps repeated work fast while still
preserving correctness.

### Exact keys stop one layout from reusing another layout's result

Cache bugs usually come from keys that are too broad.

For `embed()`, a broad key would be wrong:

```ts
const snippet = `
    a
    b
`;

const narrow = undent`
  x:
    ${embed(snippet)}
`;

const wide = undent`
  x:
          ${embed(snippet)}
`;
```

Expected output:

```text
narrow:
x:
  a
  b

wide:
x:
        a
        b
```

If the cache used only the snippet text and ignored the exact pad string, the
second render could accidentally reuse the first render's alignment. In this
section, cache poisoning means exactly that kind of mistake: cached output for
one layout gets incorrectly reused for a different layout.

`undent` avoids that by using the dedented snippet text together with the exact
pad string as the shared cache key.

The main cache situations look like this:

```text
Situation                    What can go wrong             What undent does
---------                    -----------------             ----------------
Same template call site      Recomputing the same work     Cache by template identity
Same embed, same column      Re-aligning identical text    Reuse cached aligned output
Same embed, new column       Wrong reused indentation      Key includes exact pad string
Many small distinct embeds   Memory growth or churn        Bound cache sizes + eviction
Very large embeds            Large string retention        Skip the shared cache
```

### Separate cache boundaries preserve the difference between `align()` and `embed()`

`align()` and `embed()` may start from the same raw string but they do not mean
the same thing:

```ts
const value = "    a\n    b";

const aligned = undent`
  align:
    ${align(value)}
`;
// "align:\n        a\n        b"

const embedded = undent`
  embed:
    ${embed(value)}
`;
```

Visible output with a left-edge marker:

```text
aligned:
|align:
|        a
|        b

embedded:
|embed:
|    a
|    b
```

`align()` preserves the value's own indentation. `embed()` removes the value's
own shared indentation first, then aligns the result. Sharing one global cache
between those two behaviors would be wrong, so the shared cache is restricted
to `embed()` wrappers only.

### Bounded caches reduce memory pressure, but they do not create isolation

The caches in `undent` are memoization helpers, not trust boundaries.

That means:

- exact keys prevent wrong-result reuse for different `embed()` layouts
- wrapper-specific caching keeps `align()` and `embed()` from reusing the wrong
  shape
- bounded caches reduce memory pressure, but they do not turn cache usage into
  a security boundary
- any shared in-process cache can still leak small timing signals under a
  strong enough threat model

If your application treats timing differences or in-memory string retention as
sensitive, treat cache sharing as part of your threat model. `undent` aims to
keep the cache correct and bounded, not to provide isolation between untrusted
tenants.

### Benchmarks and tests keep the cache boundaries easy to verify

The benchmark and test suite exercises the cache edges on purpose:

- repeated hot-path tagged templates
- repeated `embed()` wrappers at the same column
- repeated `embed()` wrappers across many columns
- churn from many distinct snippets
- oversized snippets that bypass the shared cache

That coverage exists to keep the tradeoff visible: the common repetitive path
should stay fast, and the boundaries that protect correctness should stay easy
to verify.

## API

| Export                                             | Description                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `undent`                                           | Default tagged template (common indent, trim all). Also the default export |
| `dedent`                                           | Alias for `undent`                                                         |
| `outdent`                                          | Pre-built instance (first-line indent, trim one)                           |
| `createUndent(options?)`                           | Create a custom instance from scratch                                      |
| `align(value)`                                     | Mark a value for column alignment                                          |
| `embed(value)`                                     | Strip a value's own indent, then align it                                  |
| `isAligned(value)`                                 | Type guard for values wrapped by `align` or `embed`                        |
| `dedentString(input, trimLeading?, trimTrailing?)` | Standalone string dedent                                                   |
| `alignText(text, pad)`                             | Pad subsequent lines of text with a prefix string                          |
| `splitLines(text)`                                 | Split a string preserving exact newline sequences                          |
| `rejoinLines(lines, seps)`                         | Reconstruct a string from `splitLines` output                              |
| `columnOffset(text)`                               | Count UTF-16 code units since the last newline (default alignment policy)  |
| `newlineLengthAt(text, i)`                         | Length of the newline sequence at position `i` (0, 1, or 2)                |
| `resolveOptions(base, overrides)`                  | Merge option objects for custom pipelines                                  |
| `DEFAULTS`                                         | The default resolved options constant                                      |
| `indent`                                           | Symbol for indent anchors                                                  |

### Unicode subpath

| Export                                  | Description                                                           |
| --------------------------------------- | --------------------------------------------------------------------- |
| `createUnicodeColumnOffset(options?)`   | Build a terminal-style Unicode-aware `columnOffset` function          |
| `unicodeColumnOffset(text, options?)`   | Measure the last line of a string in visual columns                   |
| `visualColumnWidth(text, options?)`     | Measure a single line in terminal-style display columns               |

### Options

```ts
interface UndentOptions {
  strategy?: "common" | "first"; // How to detect indent (default: "common")
  trim?: TrimMode | TrimSides; // How to trim wrapper lines (default: "all")
  newline?: string | null; // Normalize segment newlines (default: null)
  alignValues?: boolean; // Auto-align all multi-line values (default: false)
  columnOffset?: (text: string) => number; // Measure alignment columns (default: columnOffset)
}

type TrimMode = "all" | "one" | "none";

interface TrimSides {
  leading?: TrimMode;
  trailing?: TrimMode;
}
```

## Contributing

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
for automated versioning, GitHub releases, and changelog generation via
[`semantic-release`](https://semantic-release.gitbook.io/semantic-release/).

| Prefix                       | Version effect |
| ---------------------------- | -------------- |
| `fix:`                       | Patch bump     |
| `feat:`                      | Minor bump     |
| `feat!:` / `BREAKING CHANGE` | Major bump     |
| `chore:`, `docs:`, `test:`   | No bump        |

```bash
# Run tests
deno task test

# Run benchmarks
deno task bench
```

## License

[MIT](./license) © Okiki Ojo
