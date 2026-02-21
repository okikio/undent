# Changelog

All notable changes to [`@okikio/undent`](https://jsr.io/@okikio/undent) are
documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions and
entries are managed automatically by
[`@roka/forge`](https://jsr.io/@roka/forge) from
[Conventional Commits](https://www.conventionalcommits.org/).

<!-- forge appends new entries above this line -->

## [0.1.0] - 2026-02-20

Initial release.

### Added

- **Tagged template dedenting** — use `undent` as a template tag to strip
  source-code indentation from multi-line template literals. Interpolated
  values pass through untouched.
- **Plain string dedenting** — `.string()` method and standalone
  `dedentString()` for strings without template structure (SQL files, config
  snippets, runtime-built text).
- **Multi-line value alignment** — `align()` pads subsequent lines of an
  interpolated value to match the insertion column. `embed()` strips a value's
  own indentation first, then aligns.
- **Configurable trimming** — strip all leading/trailing blank lines (default),
  strip one, keep everything, or control each side independently.
- **Two indent strategies** — `"common"` (minimum indent across all lines) and
  `"first"` (first content line sets the reference). Pre-built `outdent` export
  for first-line behavior.
- **Instance composition** — `.with(options)` derives new instances without
  mutation. `createUndent(options)` builds from scratch.
- **Newline preservation** — `\n`, `\r\n`, and `\r` sequences pass through
  byte-for-byte. Optional `newline` setting normalizes segment newlines.
- **Indent anchors** — `${undent.indent}` sets an explicit zero-indent
  reference for deeply nested templates.
- **Utility exports** — `splitLines`, `rejoinLines`, `columnOffset`,
  `newlineLengthAt`, `alignText`, `resolveOptions`, and `DEFAULTS` for
  building custom pipelines.
- **Caching** — per-call-site segment cache for zero-cost repeated calls.
  Bounded caches for `embed()` and alignment memoization.

[0.1.0]: https://github.com/okikio/undent/releases/tag/undent%400.1.0
