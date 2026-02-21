# Copilot Instructions (Always-On)

## Purpose

Assist a senior engineer who values clarity, reproducibility, standards/specs,
and architectural rigor. Optimize for maintainability and future-proofing
without drifting into “abstraction for abstraction’s sake”.

## About this project

`@okikio/undent` is a single-module Deno library published to JSR and npm. The
entire public API lives in `mod.ts` — there is no separate build step and no
other source files to edit.

It does one thing: strip source-code indentation from template literals and
strings. The exports fall into three groups:

- **Tag functions** — `undent`, `dedent`, `outdent`, `createUndent`
- **Value helpers** — `align`, `embed`, `isAligned`
- **String/text utilities** — `dedentString`, `alignText`, `splitLines`,
  `rejoinLines`, `columnOffset`, `newlineLengthAt`, `resolveOptions`, `DEFAULTS`

## Commands

```bash
deno task test          # deno test --trace-leaks --v8-flags=--expose-gc
deno task bench         # run benchmarks
deno doc --lint mod.ts  # validate JSDoc on every public export
```

Always run `deno doc --lint mod.ts` after any change to the public API surface
or its documentation. It catches: missing JSDoc, `private-type-ref` errors (a
type referenced in a public signature that is not itself exported), and unnamed
`@example` blocks.

## Default operating mode

- Be high-signal and explicit.
- Prefer the smallest correct change first.
- If requirements are ambiguous, ask **one** focused question. If you can still
  move forward, propose **2–3** options with trade-offs and a recommendation.
- Don’t invent APIs/files/config. If you can’t see it, state assumptions and
  give a verification step.

## Philosophy (how to write code here)

### Standards, specs, conventions

- Prefer established standards/specs and common conventions.
- If multiple standards exist, call out differences and the practical
  trade-offs.
- Optimize for patterns that are easy to maintain, easy to follow, and easy to
  share.

### Naming

Names should be approachable and succinct, while still capturing:

- intent,
- the problem being solved,
- and the shape/nature of the solution.

Docs/comments should add nuance (and confidence), not compensate for unclear
naming.

### Documentation & comments (educational codebase)

- Default: explain _why_.
- When the _what/how_ is non-obvious (regex, bitwise/binary math, tricky boolean
  logic, performance hacks), also explain _what/how_ in plain English so a
  junior dev can follow.

For complex logic, include:

- a short docstring (problem, reasoning & logic, purpose + assumptions),
- a step-by-step algorithm explanation,
- ASCII diagrams when they improve clarity.

### Error handling

- Fail loudly and explicitly; avoid silent fallbacks and implicit coercion.
- Use typed errors or discriminated unions when appropriate.
- At external boundaries (network/storage/queue/etc), make failure modes and
  retries/timeouts/cancellation explicit.

### Configuration

- Prefer explicit configuration when it materially changes behavior.
- Also choose good defaults so configuration stays minimal and unsurprising.

### Network & infrastructure: teach mode

When networking/infra is involved:

- define acronyms and key terms (WAN/LAN/SQM/bufferbloat/NAT/MTU/etc),
- explain slowly and methodically,
- use concrete examples and metaphors.

## Breaking changes

When making a behavioral change, touch all four of these before closing the
task:

1. **Confirm all behavioral changes with user** — ask for confirmation on the
   proposed change and its scope before implementing. Be detailed about what
   will change and how it will affect the users and the project as a whole,
   including effects on performance, fragility, reliability, maintainability,
   and flexibility.
2. **Tests** — update or add assertions that reflect the new behavior.
3. **TSDoc** — update tsdocs behaviour explanations including `@example` blocks
   on the affected functions and types.
4. **README** — update the relevant docs sections including usage sections with
   matching examples.
5. **CHANGELOG** — note the change under the correct version heading.
6. **Instructions** — if the change affects how tests, benchmarks, commits, or
   documentation should be written, update the relevant file in
   `.github/instructions/`.

## Safety / Security / Privacy

- Default to least privilege.
- Avoid unsafe patterns (string-built SQL, unsafe eval, weak crypto).
- Don’t leak secrets in logs; call out trust boundaries for auth/permissions.

## Agent memory (file-based)

When acting as an agent on multi-step work:

- Read: `.agents/memory/ACTIVE/PLAN.md`, `TASKS.md`, `PROGRESS.md`
- Update `PROGRESS.md` after each meaningful step (what changed, what is next,
  what to verify)
- Mark tasks in `TASKS.md` as completed only when "Done when" checks are
  satisfied
- Do not store secrets, tokens, or private URLs in `.agents/memory/`
- Keep scratch notes in `.agents/memory/SESSIONS/` (gitignored)

## Where to look for more targeted rules

Targeted rules live under `.github/instructions/`:

| File                                | Applies to                       |
| ----------------------------------- | -------------------------------- |
| `typescript.instructions.md`        | `**/*.ts`, `**/*.tsx`            |
| `markdown-writing.instructions.md`  | `**/*.md`, `**/*.ts`, `**/*.tsx` |
| `ascii-diagrams.instructions.md`    | `**/*.ts`, `**/*.md`             |
| `testing.instructions.md`           | `**/*_test.ts`, `**/*.test.ts`   |
| `benchmarking.instructions.md`      | `**/*_bench.ts`, `**/*bench*.ts` |
| `changelog-commits.instructions.md` | `**` (all files)                 |
