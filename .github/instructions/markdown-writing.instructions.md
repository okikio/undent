---
applyTo: "**/*.md,**/*.ts,**/*.tsx,**/*.astro"
---

# Documentation Writing Style (should also apply to tsdocs)

- Write with smooth narrative flow and smooth transitions (headers can interrupt
  flow and hurt understanding): intent → context → constraints → approach → edge
  cases → examples.
- Expand acronyms on first use and define key terms (especially infra/network
  topics).
- Prefer short sections with clear headers over long walls of text.
- Include ASCII diagrams when they clarify structure or sequence.
- When describing algorithms, include step-by-step “how it works” and list
  assumptions explicitly.

If writing specs or design notes:

- Prefer RFC-style structure (Problem, Goals/Non-goals, Proposal, Alternatives,
  Risks, Rollout, Open Questions).

## Grammar

- Use present tense verbs (is, open) instead of past tense (was, opened).
- Use active voice where the subject performs the action.
