---
description: Deno + TS standards for this repo
applyTo: "**/*.ts,**/*.tsx"
---

# TypeScript / Deno Rules

## Runtime + module model

- Assume Deno v2 + strict TypeScript + ESM.
- Keep modules tree-shakeable:
  - avoid top-level side effects unless clearly required,
  - avoid hidden global state,
  - avoid surprising initialization on import.

## Formatting (match repo)

- Single quotes for strings.
- Tabs for indentation (2-wide feel).
- Opening braces on the same line as declarations.

## Imports

- Separate type imports from value imports using `import type { ... }`.
- Use explicit file extensions as the codebase does.
- Group imports by role and purpose, in this order:
  1. types
  2. framework/runtime (stdlib/external)
  3. shared/internal modules
  4. local modules

## Export style

- Prefer `function` for exported functions (avoid exporting arrow functions).
- Avoid currying.
- Avoid defining functions inside other functions unless there is a strong local
  reason.
  - If nested functions are required (callbacks/hooks), keep them small and name
    them when helpful.

## Types + API design

- Avoid `any`. Prefer generics, unions, discriminated unions, and narrowing.
- Prefer `Iterable` / `AsyncIterable` in public APIs over arrays unless there’s
  a clear reason (performance counts as a valid reason).
- Prefer `Object.assign(...)` over object spread for object copying/merging.
- Prefer explicit, narrow return types at module boundaries.

## Object copying

- Prefer `Object.assign` over spread for object copying when practical.
  - Use spread only when it materially improves readability.

## TSDoc quality bar (public surfaces)

For every exported function, interface, type alias, and constant:

- Write TSDoc in plain English — explain _why_ it exists, not just _what_ it is.
  Ground the reasoning in the problem being solved, the approach taken, and the
  assumptions/edge cases.
- Every `@example` block must have a descriptive name that clarifies the
  scenario and behaviour being demonstrated:
  ````ts
  // bad — fails deno doc --lint
  * @example
  * ```ts
  * align("hello");
  * ```

  // good — named
  * @example Aligning a multi-line value at its insertion column
  * ```ts
  * align("hello");
  * ```
  ````
- Include at least two examples for non-trivial APIs:
  - Example A: common path
  - Example B: edge case or configuration variant
- Every field of an exported interface or type needs its own JSDoc comment.
- Any type referenced in a public function signature or interface must itself be
  exported — otherwise `deno doc --lint` reports a `private-type-ref` error.

For complex logic, include:

- a docstring summarizing intent, problem, reasoning & logic, purpose +
  assumptions,
- a step-by-step algorithm explanation (with a walkthrough of the example
  inputs/outputs),
- make clear what abstract technical codes mean, e.g. binary represents
  character "C" or keycode represents "Enter", etc...,
- an ASCII diagram if it improves comprehension.

### Validate with deno doc

Run this after any public API or documentation change:

```bash
deno doc --lint mod.ts
```

This is the source of truth for doc coverage. Fix all reported errors before
closing a task.

## Error handling

- Make failure modes explicit.
- Prefer typed errors or discriminated union results when appropriate.
- Don’t swallow errors; either handle explicitly or propagate with context.
