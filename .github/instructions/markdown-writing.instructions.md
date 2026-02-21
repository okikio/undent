---
description: Documentation writing style for this repo
applyTo: "**/*.md,**/*.ts,**/*.tsx"
---

# Documentation Writing Style (should also apply to TSDocs)

## Narrative structure

Lead with user benefit, not internal mechanics:

1. **What is it?** — one plain-English sentence about what the thing is.
2. **What does it do?** — what problem it solves and what happens when you use
   it.
3. **What do you get?** — the concrete benefit: cleaner output, less code, fewer
   bugs, etc.
4. **How does it work?** — the high-level approach, key techniques, and broader
   intent/reasoning behind the system.
5. **Grounding example & details** — metaphors, charts, diagrams, tables, lists,
   blockquotes, code examples, assumptions, edge cases, limitations, and other
   important context.

This order applies to READMEs, JSR/GitHub descriptions, TSDoc for exported APIs,
and any prose that introduces a concept.

## Writing style

- Write with a clear narrative and smooth transitions. Aim to have a smooth flow
  and steady pace. Section headers interrupt flow — prefer prose that moves:
  intent, context, approach, edge cases, examples, background, reasoning.
- Use plain English. When technical terms are necessary, define them clearly and
  ground them in context.
- Headers should be descriptive and functional, not just topical. They should
  guide the reader through the narrative rather than just labeling sections.
- Use the subject's name naturally rather than passive constructions.
- Expand acronyms on first use and define key terms.
- Prefer short sections with clear headers over long walls of text.
- Include ASCII diagrams when they clarify structure or sequence.
- When describing algorithms, include step-by-step "how it works" and list
  assumptions explicitly.

If writing specs or design notes:

- Prefer RFC-style structure (Problem, Goals/Non-goals, Proposal, Alternatives,
  Risks, Rollout, Open Questions).

## Grammar

- Use present tense verbs (is, opens) instead of past tense (was, opened).
- Use active voice where the subject performs the action.
- Avoid em-dash as sentence-ending rhythm ("— use X" constructs). Restructure
  the sentence or use a colon instead or some other alternative.

## Anti-patterns

- **Burying the lede**: don't open with implementation details, prerequisites,
  or caveats. Lead with what it does and why it matters.
- **Feature-first descriptions**: listing capabilities before explaining the
  problem they solve forces the reader to infer the benefit themselves.
- **Over-hedging**: avoid "this may be useful if" or "you might want to
  consider". Be direct.
