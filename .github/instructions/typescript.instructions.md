---
description: Deno + TS standards for this repo
applyTo: "**/*.ts,**/*.tsx"
---

# TypeScript / Deno Rules (bundlejs-api)

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
- Group imports by purpose (stdlib/external/internal/types).
- Separate type imports from value imports (`import type { ... }`).
- Prefer workspace aliases when the repo uses them (e.g. `@bundle/*`, `#shared/*`).
- Use explicit file extensions in imports when the codebase does.
- Separate type imports from runtime imports.
- Group imports by role:
  1) types
  2) framework/runtime
  3) shared/internal modules
  4) local modules


## Export style
- Prefer `function` for exported functions (avoid exporting arrow functions).
- Avoid currying.
- Avoid defining functions inside other functions unless there is a strong local reason.
  - If nested functions are required (callbacks/hooks), keep them small and name them when helpful.

## Types + API design
- Avoid `any`. Prefer generics, unions, discriminated unions, and narrowing.
- Prefer `Iterable` / `AsyncIterable` in public APIs over arrays unless there’s a clear reason.
- Prefer `Object.assign(...)` over object spread for object copying/merging.
- Prefer explicit, narrow return types at module boundaries.

## Object copying

- Prefer `Object.assign` over spread for object copying when practical.
  - Use spread only when it materially improves readability.

## Docs quality bar (public surfaces)
For exported/public APIs:
- Add TSDoc in plain English.
- Include at least two examples when the API is non-trivial:
  - Example A: common path
  - Example B: edge case (failure/cancellation/invalid input)

If logic is complex:
- add a docstring summarizing intent, problem, reasoning & logic, purpose + assumptions,
- include a step-by-step algorithm explanation,
- add ASCII diagrams if it improves comprehension.


For tricky logic, include a short “walkthrough” comment and (when helpful) ASCII structure.

## Error handling
- Make failure modes explicit.
- Prefer typed errors or discriminated union results when appropriate.
- Don’t swallow errors; either handle explicitly or propagate with context.
