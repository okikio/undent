---
description: Code review standards for this repo
applyTo: "**"
---

# Code Review

Prioritize correctness, clarity, maintainability, and standards alignment.
Avoid noise: fewer, higher-signal comments.

## Review rubric (in order)

### 1. Correctness & contracts

- Does the code do what it claims?
- Are edge cases handled (empty string, single line, mixed line endings, all
  whitespace, no indentation)?
- Are public API contracts consistent across call site and implementation?

### 2. Failure modes & safety

- Are errors explicit? No silent fallbacks or implicit coercions.
- Any unsafe patterns (eval, unvalidated inputs, string-built operations)?
- Does the change affect `deno doc --lint` compliance?

### 3. Types & narrowing

- Avoid `any`. Prefer generics, unions, discriminated unions, and narrowing.
- Every type referenced in a public signature must itself be exported —
  `deno doc --lint` will catch `private-type-ref` errors.
- Return types at module boundaries should be explicit and narrow.

### 4. Readability & educational clarity

- Naming should be approachable and intent-revealing. See naming rules in
  `copilot-instructions.md`.
- Comments should explain _why_. For non-obvious logic (regex, bitwise, tricky
  boolean), also explain _what/how_ in plain English.
- If the change's intent isn't obvious from the diff, suggest improving:
  - naming and/or docstrings
  - OR the PR description to clearly state motivation and impact

### 5. Consistency & style

Match repo formatting and import conventions. See `typescript.instructions.md`.

## Output format

Use tags: `[BLOCKER]`, `[IMPORTANT]`, `[SUGGESTION]`, `[NIT]`

- Provide a concrete fix suggestion for every `[BLOCKER]` and `[IMPORTANT]`.
- Avoid generic feedback like "improve quality" — tie every comment to a
  specific behavior, risk, or readability issue.
