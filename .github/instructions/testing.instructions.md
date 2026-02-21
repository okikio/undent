---
description: Test quality standards for this repo
applyTo: "**/*_test.ts,**/*.test.ts"
---

# Testing Rules

## Tools

| Role                              | Import                                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| Test runner                       | `deno test --trace-leaks --v8-flags=--expose-gc` (via `deno task test`) |
| BDD structure (`describe` / `it`) | `jsr:@std/testing/bdd`                                                  |
| Assertions                        | `jsr:@std/expect` (`expect`)                                            |
| Property-based testing            | `npm:fast-check` (`fc`)                                                 |
| Oracle competitors                | `npm:dedent`, `npm:outdent`                                             |

Imports follow this pattern at the top of every test file:

```ts
import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import * as fc from "npm:fast-check";
```

Always run tests with `deno task test` — the flags `--trace-leaks` and
`--v8-flags=--expose-gc` are required to catch resource leaks and enable GC
control in property-based tests.

## Core principle: test behavior, not implementation

Treat the module as a black box. Call the public API, assert on the output.
Never assert on internal state, private methods, or implementation details. A
refactor that preserves observable behavior must not break any test.

## Test independence and determinism

- No shared mutable state between tests.
- No ordering dependencies — tests must pass in any order.
- No reliance on wall-clock time, random seeds, or external resources unless
  clearly isolated.
- One logical behavior per test. If a test description needs "and", split it.

## Clarity over DRYness

Tests are documentation. When a test fails, a developer should understand the
scenario immediately without chasing through helper abstractions.

Use the **AAA pattern** (Arrange, Act, Assert) for every test:

```ts
// Arrange: set up inputs
const input = `
  hello
    world
`;

// Act: call the public API
const result = undent.string(input);

// Assert: verify the observable output
expect(result).toBe("hello\n  world\n");
```

Duplicating setup between two tests is acceptable when it makes each test
self-explanatory. Extract helpers only when they genuinely reduce noise without
obscuring intent.

## Property-based tests (fast-check)

Hand-written examples only cover cases you imagined. Property-based tests
generate hundreds of random inputs and verify invariants. For a string
processing library, they are the highest-leverage test type.

Import fast-check via `npm:fast-check` and verify these invariants:

**Idempotence** — applying an operation twice equals applying it once:

```ts
fc.assert(
  fc.property(fc.string(), (s) => {
    expect(dedentString(dedentString(s))).toBe(dedentString(s));
  }),
);
```

**Roundtrip** — split then rejoin is lossless:

```ts
fc.assert(
  fc.property(fc.string(), (s) => {
    expect(rejoinLines(...splitLines(s))).toBe(s);
  }),
);
```

**Content preservation** — non-whitespace characters are never destroyed:

```ts
fc.assert(
  fc.property(fc.string(), (s) => {
    const contentChars = s.replace(/\s/g, "");
    const result = undent.string(s);
    for (const ch of contentChars) {
      expect(result).toContain(ch);
    }
  }),
);
```

**Non-negative outputs** — `columnOffset` and `newlineLengthAt` have bounded
return ranges:

```ts
fc.assert(
  fc.property(fc.string(), (s) => {
    expect(columnOffset(s)).toBeGreaterThanOrEqual(0);
  }),
);

fc.assert(
  fc.property(fc.string(), fc.nat(), (s, i) => {
    const len = newlineLengthAt(s, i);
    expect([0, 1, 2]).toContain(len);
  }),
);
```

**Cache consistency** — the same template string array with different
interpolation values must always produce structurally consistent results and
never bleed state between invocations:

```ts
const results = ["a", "bb", "ccc"].map((v) => undent`prefix ${v} suffix`);
// All results share the same trimming structure — only the interpolated
// value differs.
expect(results.every((r) => r.startsWith("prefix "))).toBe(true);
expect(results.every((r) => r.endsWith(" suffix"))).toBe(true);
```

## Oracle / compatibility tests

Don't only test against documented behavior samples. Run `npm:dedent` and
`npm:outdent` on the same randomly generated inputs and assert equivalent output
for the common behavioral subset:

```ts
import npmDedent from "npm:dedent";

fc.assert(
  fc.property(templateArbitrary(), ({ strings, values }) => {
    const ours = undent(strings, ...values);
    const theirs = npmDedent(strings, ...values);
    expect(ours).toBe(theirs);
  }),
);
```

This catches behavioral regressions that hand-crafted examples miss.

## Boundary value tests

For any feature with an "N lines" threshold, always test N = 0, 1, 2, and 3. The
`trim` option is the prime example — test 0, 1, and 2 blank lines at each edge
to catch off-by-one mutations:

```ts
const trimAll = undent.with({ trim: "all" });

// 0 blank lines at start — nothing to trim
expect(trimAll`first line`).toBe("first line");

// 1 blank line at start — exactly at boundary
expect(trimAll`\nfirst line`).toBe("first line");

// 2 blank lines at start — should also trim
expect(trimAll`\n\nfirst line`).toBe("first line");
```

## Edge cases to always cover

These are often missed but expose real bugs:

- Interpolation values that are `undefined`, `null`, `NaN`, `Infinity`, or a
  Symbol — verify no crash and sensible coercion.
- Interpolation values that contain template-syntax characters (`${}`).
- Strings with `\0` (null bytes).
- Lines with mixed indentation characters (spaces and tabs on different lines).
- Pure `\r` line endings (not just `\r\n`) with interpolation.
- Emojis and other astral Unicode characters that require surrogate pairs.
- `resolveOptions` with every partial override combination.
- `createUndent` with contradictory or extreme options.

## Anti-patterns to avoid

- **Asserting full multi-line string equality** when a structural assertion
  would be more robust. Prefer `assertStringIncludes`, line-count checks, or
  prefix/suffix assertions when exact output isn't what matters.
- **Mutation-blind assertions**: a test that runs a code path but never checks
  the return value provides false safety. Every `act` step must have an `assert`
  step that would fail if the output changed.
- **Over-abstraction in test helpers**: a helper that builds expected values
  programmatically using the same logic as the implementation is testing
  nothing. Expected values should be literals written by a human.
