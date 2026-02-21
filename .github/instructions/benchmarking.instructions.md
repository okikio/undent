---
description: Benchmark quality standards for this repo
applyTo: "**/*_bench.ts,**/*bench*.ts"
---

# Benchmarking Rules

This project uses [mitata](https://github.com/nicolo-ribaudo/mitata) for
benchmarks. The rules below prevent the most common measurement errors in
JavaScript benchmarks.

## Non-negotiable: always call `do_not_optimize()`

The JIT compiler (V8) can detect that a computation's result is unused and
eliminate the entire call — measuring an empty loop instead of your code.
`do_not_optimize()` forces the result to be "consumed" without actually using
it.

**Every benchmark callback must wrap its return value:**

```ts
import { bench, do_not_optimize } from "npm:mitata";

bench("undent: basic template", () => {
  do_not_optimize(undent`
    hello
      world
  `);
});
```

Omitting `do_not_optimize()` is the single most common cause of misleadingly
fast benchmark numbers. Treat any benchmark missing it as broken.

## Prevent constant folding with computed parameters

The JIT can prove that a template string array (TSA) is always the same frozen
object and cache the entire result, hoisting it out of the loop (LICM — Loop
Invariant Code Motion). Use mitata's computed parameter syntax to generate fresh
input values outside the measured region:

```ts
bench("undent: varying interpolation", function* () {
  // Inputs are computed outside the measured region:
  const value = yield {
    [0]() {
      return "some runtime value";
    },
  };

  // The measured region only runs the function under test:
  bench(value, (v) => {
    do_not_optimize(undent`prefix ${v} suffix`);
  });
});
```

Use computed parameters for any benchmark where inputs could be constant-folded
by the JIT. Interpolation values are the primary candidate.

## Control GC for allocation-heavy benchmarks

String allocation benchmarks produce unpredictable p99 numbers because random GC
pauses inflate outliers. Use `.gc('inner')` to run GC before each iteration:

```ts
bench("align: 500-line string", () => {
  do_not_optimize(alignText(fiveHundredLineString, "  "));
}).gc("inner");
```

Use `.gc('outer')` when you want GC to run once before the entire benchmark
trial rather than before every iteration (lower overhead, less stable
per-iteration measurements):

```ts
bench("large allocation warmup", () => {
  do_not_optimize(processLargeInput(input));
}).gc("outer");
```

**Rule of thumb:** any benchmark that allocates a string larger than ~10 KB per
iteration should use `.gc('inner')`.

## Use `.range()` instead of manual `.args()` for scaling tests

`.range('n', min, max)` auto-generates power-of-2 values, which is cleaner than
manually listing `.args([1, 2, 4, 8, 16, ...])`:

```ts
bench("undent: N interpolations", function* (state) {
  const n = yield state.range("n", 1, 64);
  const strings = Array.from({ length: n + 1 }, () => "line\n");
  const values = Array.from({ length: n }, (_, i) => `val${i}`);

  bench(String(n), () => {
    do_not_optimize(undent(strings, ...values));
  });
});
```

## Always benchmark against competitor libraries

Performance claims are meaningless without comparison. Every operation that
overlaps with `npm:dedent` and `npm:outdent` must have a side-by-side benchmark:

```ts
import dedent from "npm:dedent";
import outdent from "npm:outdent";

// Benchmark setup shared across all three
const template = (tag) =>
  tag`
  hello
    world
  goodbye
`;

bench("undent (ours)", () => {
  do_not_optimize(template(undent));
});
bench("dedent (npm)", () => {
  do_not_optimize(template(dedent));
});
bench("outdent (npm)", () => {
  do_not_optimize(template(outdent));
});
```

Use identical inputs. Run them in the same benchmark group so mitata's output
puts them side-by-side.

## Benchmark realistic scenarios, not just microbenchmarks

Microbenchmarks with degenerate inputs (0 interpolations, 1 line) don't
represent real usage and produce misleading relative comparisons. Include at
least one benchmark for each of these real-world patterns:

- **Code generation** — medium template (8-15 lines), 3-5 interpolations, some
  multi-line embedded values.
- **Config file generation** — small template (5-8 lines), 6-10 key-value
  interpolations.
- **Hot loop** — the same template called 1 000 times in sequence with different
  interpolation values. This also exercises the WeakMap cache.
- **First-call cost** — a single invocation with a freshly created template
  strings array (cache cold). Compare to warmed invocations.
- **Nested `undent` + `align`** — 2-3 levels of nesting, representative of
  JSX/HTML generation.

## Memory tests must be proper mitata benchmarks

Ad-hoc heap-delta tests that run outside the benchmark loop produce noisy
measurements that aren't comparable across runs. Either:

1. Convert them to mitata benchmarks with `.gc('inner')` so GC is controlled, or
2. Move them to a clearly separate test file and treat them as regression
   assertions (not performance measurements).

Don't mix manual `performance.memory` checks inside mitata benchmark callbacks.

## Anti-patterns

- **Discarding return values** — always `do_not_optimize()` the result.
- **Same literal in every iteration** — use computed parameters to prevent LICM.
- **Benchmarking only the happy path** — include at least one pathological input
  (e.g., deeply nested indentation, very long lines) alongside common inputs.
- **No competitor baseline** — if you can't show undent is faster than dedent or
  outdent on a given operation, don't claim it is.
- **Overhead comparison against raw template literals** — the raw template
  literal is a zero-cost language feature. The meaningful comparison is undent
  vs. competitor libraries, not undent vs. nothing.
