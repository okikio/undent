---
description: Commit message and changelog standards for this repo
applyTo: "**"
---

# Commit Messages and Changelogs

## Commit messages

### Format (conventional commits)

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types that appear in the changelog:** `feat`, `fix`

**Types filtered from the changelog:** `chore`, `docs`, `style`, `refactor`,
`perf`, `test`, `build`, `ci`

Use a `!` after the type/scope to mark breaking changes:
`feat(api)!: remove align()'s implicit trim behavior`

### Subject line rules (Chris Beams)

1. Target 50 characters; never exceed 72 (hard limit).
2. Capitalize the first word of the description.
3. No period at the end.
4. Use the imperative mood: "Add", "Fix", "Remove", not "Added", "Fixed",
   "Removes".
5. Separate from the body with a blank line.

**Imperative mood test:** "If applied, this commit will [subject line]."
Both of these must pass that test:

```
# Good
feat(align): support custom pad characters

# Bad — past tense, fails the test
feat(align): added support for custom pad characters
```

### Subject line as changelog entry

The subject line feeds the generated changelog. Write it as if it describes
**user-visible impact**, not implementation detail. The body is where
implementation reasoning lives.

```
# Bad — implementation detail as subject
fix(cache): correct WeakMap lookup for identical TSAs

# Good — user-visible symptom as subject
fix(cache): prevent stale results when the same template is reused
```

### Body rules

- Wrap at 72 characters.
- Explain **why** the change exists, not what the diff contains (the diff
  shows what changed).
- Apply the "5 Whys" rule: if the reason is "it was broken", go one level
  deeper. Why was it broken? What assumption failed?
- Include migration guidance when there is a behavior change.
- Reference related issues with `Closes #123` (auto-closes on merge) or
  `Refs #123` (links without closing).
- A commit body that takes longer to write than the code change is acceptable
  and sometimes the right call.

### Atomic commits

One logical change per commit. If you are fixing a bug and refactoring
unrelated code, split them. A commit that cannot be summarized in 50
characters is probably doing too much.

When contributing a feature via a pull request, prefer squash-merging with a
single well-crafted conventional commit message that represents the changelog
entry, rather than letting every interim commit flow into `main`.

### Breaking changes

Footer format:

```
BREAKING CHANGE: <what breaks>

<migration path — what callers must do instead>
```

Breaking changes must appear in the commit footer even when the type already
uses `!`. Both the `!` in the subject and the `BREAKING CHANGE` footer are
required so tooling reliably detects and surfaces the change.

---

## Changelogs

The changelog is a communication contract with users. It is not a byproduct of
development. It is the primary artifact that tells people whether to upgrade,
what will break, and whether the project is actively maintained.

### Structure (Keep a Changelog)

- Keep an `[Unreleased]` section at the top of `changelog.md` that accumulates
  changes between tags.
- At release time, rename `[Unreleased]` to the version and date, then open a
  fresh `[Unreleased]` section.
- Latest version comes first.
- Use these six standard categories (omit empty ones):

  | Category     | What belongs here                          |
  | ------------ | ------------------------------------------ |
  | `Added`      | New features, new exports, new options     |
  | `Changed`    | Behavior changes to existing functionality |
  | `Deprecated` | Things that still work but will be removed |
  | `Removed`    | Removed features, removed exports          |
  | `Fixed`      | Bug fixes                                  |
  | `Security`   | Vulnerability patches                      |

### Writing changelog entries

Write for human impact, not technical accuracy. Reference the user-visible
symptom and the result of the fix, not the implementation mechanism.

```md
<!-- Bad — implementation detail -->

- Fix async loop timing in `dedentString`

<!-- Good — user-visible impact -->

- Fix `dedentString` hanging on strings with mixed `\r\n` and `\r` line endings
```

Connect changes to broader context when useful. When fixing a long-standing
bug, link to the original issue. For new features, link to the documentation.

### Calling out breaking changes

Prefix every breaking change entry with **Breaking:** and explain both what
breaks and what the migration path is:

```md
### Changed

- **Breaking:** `align()` no longer trims trailing whitespace from padded
  lines. Callers that relied on the implicit trim must call `.trimEnd()` on
  the result explicitly.
```

### The deprecation contract

Deprecations should be visible across at least one version before removal.
The changelog must make the path explicit:

```md
## [0.9.0] — deprecates X

### Deprecated

- `outdent` export alias — use `undent` instead. Will be removed in 1.0.

## [1.0.0] — removes X

### Removed

- `outdent` export alias (deprecated in 0.9.0)
```

### Yanked releases

If a published version is retracted (npm unpublish, JSR yank), mark it
explicitly in the changelog rather than deleting the entry:

```md
## [0.8.1] — 2025-01-15 [YANKED]

Yanked due to a regression in `dedentString` that corrupted `\r\n` line
endings. Use 0.8.2 instead.
```

### Pre-release checklist

Before tagging a release:

1. Rename `[Unreleased]` to the new version with today's date.
2. Read every generated entry. Ask: "would a new user of this package
   understand what changed and why?"
3. Group related entries and add context where the commit subject alone is
   insufficient.
4. Diff the full commit log against the generated entries. Check whether any
   `chore`, `refactor`, or `perf` commits actually had user-visible effects
   that were miscategorized (changed API timing, dropped support for something,
   altered output format). If so, add them manually.
5. Verify breaking changes are prominent and include a migration path.
6. Verify the narrative reads as a coherent story of deliberate work, not a
   random list.
