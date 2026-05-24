## [0.3.3](https://github.com/okikio/undent/compare/undent@0.3.2...undent@0.3.3) (2026-05-24)


### Bug Fixes

* **release:** Sync deno.json before publishing ([000d38d](https://github.com/okikio/undent/commit/000d38df4323c76525e038eaddd726efd731214d))


### Reverts

* **release:** Restore workflows from 0.3.2 release ([aade662](https://github.com/okikio/undent/commit/aade662e87ca50794b7872bb52cb6806f9ac9704))

## [0.3.2](https://github.com/okikio/undent/compare/undent@0.3.1...undent@0.3.2) (2026-05-24)


### Bug Fixes

* **release:** Split release and publish workflows ([ec3540b](https://github.com/okikio/undent/commit/ec3540b156c39e815708fc7baedd20ca06fefe7b))

## [0.3.1](https://github.com/okikio/undent/compare/undent@0.3.0...undent@0.3.1) (2026-05-24)


### Performance Improvements

* **embed:** Avoid re-aligning identical snippet-column pairs ([30672fc](https://github.com/okikio/undent/commit/30672fc6c6f2c153eca220d2c7a4157acde41b7f))

# [0.3.0](https://github.com/okikio/undent/compare/undent@0.2.1...undent@0.3.0) (2026-05-22)


### Features

* **unicode:** Add Unicode-aware alignment helpers ([35ca2d4](https://github.com/okikio/undent/commit/35ca2d4c9d44c46e3217a5ba0478004217835161))


### Performance Improvements

* **bench:** Expand hot-path benchmark coverage ([a54d039](https://github.com/okikio/undent/commit/a54d0397b087b2d17c581d296d4551249c5510d2))

## undent@0.2.1

### Fixed

- Regex cache now has a bounded size, preventing unbounded memory growth in
  long-running processes that process many distinct strings.

### Docs

- Corrected output comments in README examples for `undent`, `align()`, and
  trim modes — several expected outputs were wrong or incomplete.
- Added before/after examples for core indent stripping and trim modes to make
  the behavior immediately clear without reading prose.

# Changelog

All notable changes to [`@okikio/undent`](https://jsr.io/@okikio/undent) are
documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions and
entries are managed automatically by
[`semantic-release`](https://semantic-release.gitbook.io/semantic-release/)
from [Conventional Commits](https://www.conventionalcommits.org/).

<!-- semantic-release prepends new entries above this line -->

## undent@0.2.0

### Added

- Package is now published to **npm** as
  [`@okikio/undent`](https://www.npmjs.com/package/@okikio/undent). Node.js and
  Bun users can install directly with `npm install @okikio/undent` in addition
  to the existing `npx jsr add @okikio/undent` path. The package ships both CJS
  (`require`) and ESM (`import`) builds with full TypeScript declarations.

### Changed

- Memory regression tests now use a two-phase growth-rate check instead of a
  single before/after snapshot, catching leaks that one-time initialisation
  overhead (JIT compilation, WeakMap warming) would previously mask.

## undent@0.1.0

Initial release.

### Added

- **Tagged template dedenting** — use `undent` as a template tag to strip
  source-code indentation from multi-line template literals. Interpolated values
  pass through untouched.
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
- **Indent anchors** — `${undent.indent}` sets an explicit zero-indent reference
  for deeply nested templates.
- **Utility exports** — `splitLines`, `rejoinLines`, `columnOffset`,
  `newlineLengthAt`, `alignText`, `resolveOptions`, and `DEFAULTS` for building
  custom pipelines.
- **Caching** — per-call-site segment cache for zero-cost repeated calls.
  Bounded caches for `embed()` and alignment memoization.
