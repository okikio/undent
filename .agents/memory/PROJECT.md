# Project Summary

## Outcome

`@okikio/undent` is a single-module Deno library that strips source-code
indentation from template literals and plain strings.

## Context

- Runtime: Deno v2, TypeScript (strict), ESM
- Published to: JSR and npm
- Entire public API lives in `mod.ts` — no separate build step

## Key exports

- **Tag functions** — `undent`, `dedent`, `outdent`, `createUndent`
- **Value helpers** — `align`, `embed`, `isAligned`
- **String/text utilities** — `dedentString`, `alignText`, `splitLines`,
  `rejoinLines`, `columnOffset`, `newlineLengthAt`, `resolveOptions`, `DEFAULTS`

## Constraints

- All public API types must be exported (enforced by `deno doc --lint`).
- No hidden global state; no top-level side effects.
- Keep the module tree-shakeable.

## Non-goals

This file is not a full API spec or changelog. See `mod.ts` TSDoc and
`readme.md` for those.
