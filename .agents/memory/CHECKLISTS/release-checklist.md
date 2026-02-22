# Release Checklist

## Scope

- [ ] Release intent is documented in `changelog.md`.
- [ ] Backwards compatibility risks are identified and called out.

## Artifacts

- [ ] Version bumped via `deno task forge bump`.
- [ ] Changelog entries are accurate and human-readable.
- [ ] Breaking changes are prominently marked with migration paths.

## Validation

- [ ] `deno task test` passes on the release commit.
- [ ] `deno task bench` passes on the release commit.
- [ ] `deno doc --lint mod.ts` passes with no errors.
- [ ] JSR publish dry-run: `deno publish --dry-run`.
- [ ] npm build succeeds: `deno task build:npm`.

## Rollback

- [ ] Rollback plan is clear if a regression is found post-publish.
- [ ] Yanked releases are marked in `changelog.md` with a note.
