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

**Syntax rules — every commit must satisfy all of these:**

| Rule                                | Correct             | Wrong                          |
| ----------------------------------- | ------------------- | ------------------------------ |
| Type is lowercase                   | `fix:`              | `Fix:`, `FIX:`                 |
| Single space after colon            | `fix: avoid`        | `fix:avoid`, `fix:  avoid`     |
| No period at end of subject         | `fix: avoid crash`  | `fix: avoid crash.`            |
| Subject capitalised                 | `feat: Add align()` | `feat: add align()`            |
| Blank line between subject and body | _(blank line)_      | body immediately after subject |
| No trailing whitespace              | —                   | lines ending with spaces       |
| No emoji in subject                 | `feat: add embed()` | `✨ feat: add embed()`         |

**Types that appear in the changelog:** `feat`, `fix`

**Types filtered from the changelog:** `chore`, `docs`, `style`, `refactor`,
`perf`, `test`, `build`, `ci`

Use a `!` after the type/scope to mark breaking changes:
`feat(api)!: remove align()'s implicit trim behavior`

### Anti-patterns — never write these

These are the commit patterns that make the log useless. Each one has a direct
fix.

**Typeless / formatless subjects** — if there is no `type:` prefix, tooling
cannot categorise the commit and forge silently drops it from the changelog.

```
# Bad — no type, nothing actionable
update
fix stuff
typo
changes
misc
tweaks

# Good
docs: fix typo in dedentString example
fix: handle empty string in columnOffset
```

**WIP commits on main** — work-in-progress commits signal an unfinished thought.
Squash them before merging. A WIP commit that ships is a changelog entry that
reads "WIP".

```
# Bad — never let these reach main
WIP
WIP: almost working
wip: untested refactor
temp
temp fix
stash
```

**Vague descriptions** — a description that could apply to any commit in any
repo is not a description. Watch especially for weasel verbs: **enhance**,
**improve**, **update**, **refactor**, **tweak**, **clean up**, **address**,
**various**. None of them say what changed.

```
# Bad — describes nothing; "enhance" is content-free
docs: enhance commit message and changelog standards
fix: improve splitLines
chore: update deps
refactor: clean up mod.ts
fix: address review comments
chore: various fixes

# Good — names what was added, fixed, or removed
docs: add anti-patterns and syntax rules to commit instructions
fix: handle bare \r as a line separator in splitLines
chore: bump @std/assert to 1.0.19
refactor: extract rejoinLines into a standalone helper
fix: prevent NaN in alignText when pad is empty string
fix: prevent double-stripping on nested undent calls
```

**Ticket / PR numbers in the subject** — numbers in the subject become the
changelog entry, and a number is meaningless without the tracker open in another
tab. Put references in the body or footer.

```
# Bad — changelog reads as "fix #442"
fix: #442
fix: issue 442

# Good — describe the fix, reference in footer
fix: prevent NaN in alignText when pad is empty string

Closes #442
```

**Capitalised or mixed-case type** — breaks parser matching in some conventional
commit tools and looks inconsistent.

```
# Bad
Fix: remove trim from align output
FEAT: add embed helper
Chore: bump deno.lock

# Good
fix: remove trim from align output
feat: add embed helper
chore: bump deno.lock
```

**Scope as file path** — the scope names a logical area, not a file.

```
# Bad
feat(mod.ts): add embed
fix(src/utils/lines.ts): handle \r

# Good
feat(embed): add embed helper
fix(splitLines): handle bare \r as line separator
```

**More than one logical change per commit** — if you need "and" to describe the
subject, it is two commits.

```
# Bad — two unrelated changes
fix: handle \r and also add new embed helper

# Good — two commits
fix: handle bare \r in splitLines
feat: add embed helper for pre-indented values
```

**`build` for infrastructure additions** — `feat` means a user-visible API change
and triggers a minor version bump. Build scripts, publish workflows, and
developer tooling are infrastructure; package consumers never see them. Using
`feat` here bumps the version for a change users cannot observe and adds a
misleading "Features" entry to the changelog.

```
# Bad — no user-visible API changed; wrongly bumps minor version
feat(build): add npm package build script using @deno/dnt
feat(ci): add publish workflow
feat: add scripts/build_npm.ts

# Good — infrastructure type, no version bump, no changelog entry
build(npm): add package build script using @deno/dnt
ci: add npm publish job to publish workflow
build: add scripts/build_npm.ts
```

### Choosing the right type

Ask these questions in order:

1. **Does it change what a _consumer_ of the package can do?** → `feat` — New
   export, new option, new runtime behavior that didn't exist before. The test:
   would a user need to update their own code to take advantage of it?
   **Infrastructure additions (build scripts, CI workflows, publish tooling) are
   never `feat`** even if they are new — they are not part of the public API
   surface.

2. **Does it fix something broken?** → `fix` — Observable bug: wrong output,
   crash, incorrect coercion, bad edge case.

3. **Does it only change docs or comments?** → `docs` — README, TSDoc, changelog
   prose, or `.github/instructions/` files. No code change.

4. **Does it only change whitespace, formatting, or naming?** → `style` — No
   logic change; a linter or formatter could have made it.

5. **Does it restructure code without changing behavior?** → `refactor` —
   Rename, extract function, reorganize — output is identical.

6. **Does it make something measurably faster or smaller?** → `perf` —
   Benchmark-verified improvement. If behavior also changes, use `fix` or
   `feat`.

7. **Does it add or fix tests?** → `test` — No production code change.

8. **Does it touch CI, build scripts, or dependencies?** → `chore` / `ci` /
   `build` — `ci` for workflow files, `build` for compile/bundle config, `chore`
   for everything else (deps, lockfile, tooling).

**Hard rule:** if the change would make a user's code behave differently at
runtime, it is `feat` or `fix` — never `refactor` or `chore`. Mislabeling a
user-visible change as `refactor` silently drops it from the changelog and from
forge's version calculation.

### Subject line rules (Chris Beams)

1. Target 50 characters; never exceed 72 (hard limit).
2. Capitalize the first word of the description.
3. No period at the end.
4. Use the imperative mood: "Add", "Fix", "Remove", not "Added", "Fixed",
   "Removes".
5. Separate from the body with a blank line.

**Imperative mood test:** "If applied, this commit will [subject line]." Both of
these must pass that test:

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
- Explain **why** the change exists, not what the diff contains (the diff shows
  what changed).
- Apply the "5 Whys" rule: if the reason is "it was broken", go one level
  deeper. Why was it broken? What assumption failed?
- Include migration guidance when there is a behavior change.
- Reference related issues with `Closes #123` (auto-closes on merge) or
  `Refs #123` (links without closing).
- A commit body that takes longer to write than the code change is acceptable
  and sometimes the right call.

### Atomic commits

One logical change per commit. If you are fixing a bug and refactoring unrelated
code, split them. A commit that cannot be summarized in 50 characters is
probably doing too much.

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

### How forge reads commits

This project uses `deno task forge` (`jsr:@roka/forge`) to calculate versions
and generate changelogs. Forge reads conventional commits directly:

- `fix` → patch version bump
- `feat` → minor version bump
- `!` suffix or `BREAKING CHANGE` footer → major version bump
- All other types (`chore`, `docs`, `refactor`, etc.) → no version bump

For a single-package repo, the scope can be omitted — `feat: add thing` works
identically to `feat(undent): add thing`. Omit the scope to keep subjects
concise unless you need to distinguish between multiple packages.

**The commit subject becomes the changelog entry verbatim.** Forge extracts it
as-is. There is no editing step between what you type and what users read, so
subject line quality matters more than usual.

---

## Changelogs

The changelog is a communication contract with users. It is not a byproduct of
development. It is the primary artifact that tells people whether to upgrade,
what will break, and whether the project is actively maintained.

### Structure (managed by forge)

`changelog.md` is generated and updated by `forge bump` — do not manually
maintain version headers or `[Unreleased]` sections. Forge owns the file
structure.

What you can and should do manually:

- Edit entries after `forge bump` creates the PR to add context, group related
  changes, or clarify impact where the raw commit subject is insufficient.
- Add `**Breaking:**` prefixes to breaking change entries if they need clearer
  callouts.
- Add entries for any user-visible `chore`, `refactor`, or `perf` commits that
  were miscategorized and would otherwise be silently omitted.

### Release workflow

1. Preview pending changes: `deno task forge changelog`
2. Bump version and open PR:
   `GITHUB_TOKEN=$(gh auth token) deno task forge bump --release --pr`
3. Review the generated PR — edit `changelog.md` entries where the raw commit
   subject needs more context.
4. Merge the PR.
5. Create the GitHub release:
   `GITHUB_TOKEN=$(gh auth token) deno task forge release`
6. Publishing is automated — pushing a GitHub Release triggers `publish.yml`,
   which publishes to **JSR** (`deno publish`) and **npm**
   (`deno task build:npm` followed by `npm publish`) in parallel jobs. Both are
   idempotent; re-running the workflow for an already-published version is safe.

   To publish manually:
   - JSR: `deno publish`
   - npm: `deno task build:npm && cd npm && npm publish --access public`

### Writing changelog entries

Write for human impact, not technical accuracy. Reference the user-visible
symptom and the result of the fix, not the implementation mechanism.

```md
<!-- Bad — implementation detail -->

- Fix async loop timing in `dedentString`

<!-- Good — user-visible impact -->

- Fix `dedentString` hanging on strings with mixed `\r\n` and `\r` line endings
```

Connect changes to broader context when useful. When fixing a long-standing bug,
link to the original issue. For new features, link to the documentation.

### Calling out breaking changes

Prefix every breaking change entry with **Breaking:** and explain both what
breaks and what the migration path is:

```md
### Changed

- **Breaking:** `align()` no longer trims trailing whitespace from padded lines.
  Callers that relied on the implicit trim must call `.trimEnd()` on the result
  explicitly.
```

### The deprecation contract

Deprecations should be visible across at least one version before removal. The
changelog must make the path explicit:

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

Yanked due to a regression in `dedentString` that corrupted `\r\n` line endings.
Use 0.8.2 instead.
```

### Pre-release review checklist

Before approving the bump PR:

1. Read every generated changelog entry. Ask: "would a new user of this package
   understand what changed and why?"
2. Group related entries and add context where the commit subject alone is
   insufficient.
3. Diff the full commit log against the generated entries. Check whether any
   `chore`, `refactor`, or `perf` commits had user-visible effects that were
   miscategorized. If so, add them manually.
4. Verify breaking changes are prominent and include a migration path.
5. Verify the narrative reads as a coherent story of deliberate work, not a
   random list.
