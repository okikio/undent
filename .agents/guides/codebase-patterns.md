# Codebase Patterns — `mod.ts`

Reference for the key architecture, data flow, and internal patterns in
`mod.ts`. Read this before making any non-trivial change.

## Two processing paths

```
Input
  │
  ├─ Tagged template (undent`...`)
  │      │
  │      ├─ TSA cache hit?  ──yes──▶  reuse stripped segments
  │      │        │
  │      │        no
  │      │        ▼
  │      │   compute column offsets on static segments only
  │      │   strip common indent from segments
  │      │   cache result keyed on TSA (WeakMap)
  │      │        │
  │      └─────── ▼
  │          join segments + interpolated values
  │          apply align/embed padding
  │          trim wrapper blank lines
  │          return string
  │
  └─ Plain string (undent.string(s) / dedentString(s))
         │
         ▼
     splitLines → find min column offset → strip → rejoinLines
     trim wrapper blank lines per TrimMode
     return string
```

Key distinction: **interpolated values are never stripped** — only the
static template segments are processed. Values pass through as-is unless
wrapped with `align()` or `embed()`.

## TSA WeakMap cache

`TemplateStringsArray` is a frozen object created once per call site. The same
literal always produces the same TSA object, so a `WeakMap` keyed on it acts as
per-call-site memoization with zero string identity cost. The cache stores
already-stripped static segments; repeated calls (e.g. inside a hot loop) only
pay for joining and value interpolation, not the indent-detection pass.

**LICM risk**: the JIT can hoist cache hits out of loops entirely, making
benchmarks misleadingly fast. Use mitata's computed parameters to prevent this.
See `benchmarking.instructions.md`.

## `indent` symbol — explicit baseline

When `${undent.indent}` (or `${indent}`) appears as the first interpolation on
its own line, that line's column position becomes the dedent baseline instead of
auto-detecting from all content lines. Content at the same column becomes column
0; deeper content retains relative spacing.

## `align` and `embed` — multi-line value helpers

Both return an `AlignedValue` — a branded object with `[ALIGNED]: true`
and a `value: string` field.

```
align(v) ─▶ { [ALIGNED]: true, value: String(v) }
                              ↑ no stripping

embed(v) ─▶ dedentString(v)
           │
           ▼
           { [ALIGNED]: true, value: stripped }
                              ↑ own indent removed first
```

At join time, `undent` checks `[ALIGNED]` and pads lines 2…N of the
value with the insertion column's worth of whitespace.

`embed` also has a bounded LRU-style cache (`EMBED_CACHE`, max 256
entries) for repeated static snippets.

## `AlignedValue` per-value text cache

Each `AlignedValue` carries a small bounded cache stored as a non-enumerable
symbol property. It maps column positions to already-padded strings, so the
same value used repeatedly at the same insertion column avoids re-padding on
every call. Check `mod.ts` for the current cap.

## Character code constants

Hot scanning loops use integer character codes instead of string methods:

| Constant    | Hex    | Character |
| ----------- | ------ | --------- |
| `CC_TAB`    | `0x09` | `\t`      |
| `CC_LF`     | `0x0a` | `\n`      |
| `CC_CR`     | `0x0d` | `\r`      |
| `CC_SPACE`  | `0x20` | ` `       |

`string.charCodeAt(i)` is used instead of `string[i]` comparisons.

## `splitLines` / `rejoinLines`

- `splitLines(s)` splits on `\n`, `\r\n`, and bare `\r`, returning each
  segment with its trailing newline sequence attached.
- `rejoinLines(...segments)` concatenates them back — `splitLines` →
  `rejoinLines` is a guaranteed lossless roundtrip for any input.
- These are the canonical way to iterate lines without losing newline
  sequences.

## `columnOffset`

Returns the number of leading whitespace characters (spaces + tabs) before
the first non-whitespace character on a line. Returns `Infinity` for
blank/whitespace-only lines (so they don't pull the minimum indent down).

## `TrimMode` and `TrimSides`

```
"all"  — strip every leading/trailing blank line
"one"  — strip at most one blank line per edge
"none" — leave edges untouched
```

Can be set independently per side via `TrimSides`. The template engine
applies trimming after joining, not during segment processing.

## `DEFAULTS` and `resolveOptions`

`DEFAULTS` is the exported `ResolvedOptions` object with every field set to its
sensible out-of-the-box value. Check `mod.ts` for the current defaults — they
grow as new options are added.

`resolveOptions(options, base?)` merges user `UndentOptions` onto a base
(defaulting to `DEFAULTS`), normalizing the `trim` shorthand into
`trimLeading`/`trimTrailing` fields.

## `createUndent`

The factory that builds a bound `Undent` object from a `ResolvedOptions`.
`undent`, `dedent`, and `outdent` are all instances created with different
defaults via `createUndent`. When adding configuration-dependent behaviour,
add it here.

For the current full public API, run `deno doc mod.ts` or read the exports at
the top of `mod.ts` directly — duplicating that list here would only drift.
