# Review Checklist

## Correctness

- [ ] Behavior matches the stated intent.
- [ ] Edge cases and error paths are handled explicitly (empty string, single
      line, all whitespace, mixed line endings).

## Safety

- [ ] No unsafe patterns (eval, silent fallbacks, implicit coercions).
- [ ] Trust boundaries are clear.

## Maintainability

- [ ] Naming is clear, intent-revealing, and consistent with the existing API.
- [ ] Complex logic is explained with comments or ASCII diagrams.
- [ ] `deno doc --lint mod.ts` still passes — no `private-type-ref` errors.

## Verification

- [ ] `deno task test` passes.
- [ ] `deno doc --lint mod.ts` passes.
- [ ] Verification steps are adequate for the stated change.
