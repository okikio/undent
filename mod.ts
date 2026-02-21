/**
 * # @okikio/undent
 *
 * Strip source-code indentation from template literals and strings.
 *
 * When you write multi-line template literals inside functions, classes,
 * or other indented blocks, the indentation from your source code bleeds
 * into the output string. `undent` removes that structural indent while
 * keeping any relative indentation you actually want.
 *
 * ```ts
 * // Deno
 * import { undent } from "jsr:@okikio/undent";
 *
 * // Node / Bun (npm)
 * // npm install @okikio/undent
 * import { undent } from "@okikio/undent";
 * ```
 *
 * ```ts
 * // Without undent — output has 4 unwanted leading spaces per line:
 * const bad = `
 *     Hello, world!
 *     Welcome aboard.
 * `;
 *
 * // With undent — clean output, readable source:
 * const good = undent`
 *     Hello, world!
 *     Welcome aboard.
 * `;
 * // "Hello, world!\nWelcome aboard."
 * ```
 *
 * Two processing paths handle different input shapes:
 *
 * - **Tagged templates** split the literal into static segments and
 *   interpolated values. Only the segments are processed — values pass
 *   through untouched. Results are cached per call site.
 *
 * - **Plain strings** (via `.string()` or {@link dedentString}) scan
 *   every line for the minimum indent, strip it, and trim wrapper blank
 *   lines. Original newline sequences (`\n`, `\r\n`, `\r`) are
 *   preserved byte-for-byte.
 *
 * Both paths share the same guarantees: non-whitespace content is never
 * removed, newlines in interpolated values are never normalized, and
 * multi-line values can be aligned at their insertion column with
 * {@link align} or {@link embed}.
 *
 * @module
 */

// ==========================================================================
// Public types
// ==========================================================================

/**
 * Controls how leading and trailing blank lines are trimmed.
 *
 * - `"all"` — remove every blank line at the edge (default)
 * - `"one"` — remove at most one blank line from each end
 * - `"none"` — keep everything, including wrapper lines
 */
export type TrimMode = "all" | "one" | "none";

/**
 * Per-side trim control. Use this when you want different behavior
 * on the leading vs. trailing edge:
 *
 * ```ts
 * const u = undent.with({
 *   trim: { leading: "none", trailing: "all" },
 * });
 * ```
 */
export interface TrimSides {
  /** How to trim blank lines at the start of the output. */
  leading?: TrimMode;
  /** How to trim blank lines at the end of the output. */
  trailing?: TrimMode;
}

/**
 * Options for configuring an `undent` instance.
 *
 * Every option has a sensible default. You only need to set the ones
 * you want to change:
 *
 * ```ts
 * const u = undent.with({ strategy: "first", trim: "one" });
 * ```
 */
export interface UndentOptions {
  /**
   * How to decide which whitespace is "structural" indent.
   *
   * - `"common"` — scan every content line and strip the smallest
   *   shared indent. Safest default.
   * - `"first"` — use the first content line's indent as the
   *   reference. Matches the `outdent` npm package.
   *
   * @default "common"
   */
  strategy?: "common" | "first";

  /**
   * How to handle the blank lines at the start and end of the output
   * (the newline after the opening backtick and the whitespace-only
   * line before the closing one).
   *
   * Pass a string for symmetric trimming, or an object to control
   * each side independently:
   *
   * ```ts
   * undent.with({ trim: { leading: "none", trailing: "all" } });
   * ```
   *
   * @default "all"
   */
  trim?: TrimMode | TrimSides;

  /**
   * Replace newlines in template segments with this string.
   *
   * Set to `"\n"` to normalize all line endings to LF, or leave as
   * `null` to preserve the original `\n` / `\r\n` / `\r` sequences.
   * Newlines inside interpolated `${values}` are never touched.
   *
   * @default null
   */
  newline?: string | null;

  /**
   * Automatically align every multi-line interpolated value at its
   * insertion column.
   *
   * When `false` (default), only values wrapped with {@link align}
   * or {@link embed} are aligned. Set to `true` to align all of them
   * without wrapping each one individually.
   *
   * @default false
   */
  alignValues?: boolean;
}

/**
 * A callable template tag with configuration and helper methods.
 *
 * Use it directly as a tagged template, or call `.with()` to create
 * a customized instance, or `.string()` to strip indent from a plain
 * string.
 *
 * ```ts
 * // As a template tag:
 * undent`
 *   Hello, world!
 * `;
 * // "Hello, world!"
 *
 * // As a string processor:
 * undent.string("    indented text");
 * // "indented text"
 *
 * // With custom options:
 * const u = undent.with({ trim: "none" });
 * ```
 */
export interface Undent {
  /** Strip structural indent from a tagged template literal. */
  (strings: TemplateStringsArray, ...values: unknown[]): string;

  /**
   * Create a new instance with different options. The current instance
   * is never mutated — settings are inherited and overridden:
   *
   * ```ts
   * const base = undent.with({ newline: "\n" });
   * const strict = base.with({ trim: "none" }); // inherits newline
   * ```
   */
  with(options: UndentOptions): Undent;

  /**
   * Strip indent from an arbitrary string (not a template literal).
   *
   * Uses the same trim and newline settings as the instance. Scans
   * every line for the minimum indent and strips it:
   *
   * ```ts
   * const sql = readFileSync("query.sql", "utf8");
   * const clean = undent.string(sql);
   * ```
   */
  string(input: string): string;

  /**
   * Indent anchor symbol. Place as the first interpolation on its own
   * line to set an explicit left margin for the output.
   *
   * The anchor's column position becomes the indent baseline. Content
   * at the anchor's column becomes column 0 in the output; content
   * deeper than the anchor keeps its relative spacing.
   *
   * This gives you explicit control over stripping instead of relying
   * on automatic detection. It's especially useful in code generation
   * where templates live deep inside nested classes or functions.
   *
   * @example Content at anchor column becomes column 0
   * ```ts
   * import { undent } from "@okikio/undent";
   *
   * class Generator {
   *   emit(name: string) {
   *     return undent`
   *       ${undent.indent}
   *       export function ${name}() {
   *         // implementation
   *       }
   *     `;
   *     // anchor and content at same column → output at column 0:
   *     // "export function hello() {\n  // implementation\n}"
   *   }
   * }
   * ```
   *
   * @example Content deeper than anchor preserves relative spacing
   * ```ts
   * import { undent } from "@okikio/undent";
   *
   * function indentedOutput() {
   *   return undent`
   *     ${undent.indent}
   *       if (ready) {
   *         run();
   *       }
   *   `;
   *   // Content is 2 deeper than anchor → 2-space indent preserved:
   *   // "  if (ready) {\n    run();\n  }"
   * }
   * ```
   */
  readonly indent: typeof indent;
}

/**
 * Fully resolved configuration where every field is required.
 *
 * This is what `undent` uses internally after merging defaults with
 * user overrides. Exported for consumers building custom configuration
 * pipelines via {@link resolveOptions}.
 */
export interface ResolvedOptions {
  /** Indent detection strategy: `"common"` scans all lines, `"first"` uses the first content line. */
  strategy: "common" | "first";
  /** How to trim blank lines at the start of the output. */
  trimLeading: TrimMode;
  /** How to trim blank lines at the end of the output. */
  trimTrailing: TrimMode;
  /** When set to a string, replaces newline sequences in template segments. `null` preserves originals. */
  newline: string | null;
  /** When `true`, every multi-line interpolated value is automatically aligned at its insertion column. */
  alignValues: boolean;
}

// ==========================================================================
// Symbols, wrappers, and value markers
// ==========================================================================

/**
 * Indent anchor symbol.
 *
 * Place `${undent.indent}` (or import this symbol directly) as the
 * first interpolation on its own line to set the indent baseline.
 * The anchor's column becomes column 0 for content at the same
 * depth, and deeper content keeps its relative spacing.
 *
 * @example Using the indent symbol directly or via undent.indent
 * ```ts
 * import { undent, indent } from "@okikio/undent";
 *
 * // These are equivalent:
 * undent`
 *   ${undent.indent}
 *   export class Foo {
 *     bar = 1;
 *   }
 * `;
 * undent`
 *   ${indent}
 *   export class Foo {
 *     bar = 1;
 *   }
 * `;
 * // Both produce: "export class Foo {\n  bar = 1;\n}"
 * ```
 */
export const indent: unique symbol = Symbol("undent.indent");

/**
 * Brand symbol for values wrapped by {@link align} or {@link embed}.
 *
 * You rarely need this directly — use {@link isAligned} to check
 * whether a value is wrapped, and {@link align}/{@link embed} to
 * create wrapped values. Exported so the {@link AlignedValue}
 * interface can reference it in public type signatures.
 */
export const ALIGNED: unique symbol = Symbol("undent.aligned");

/** Internal symbol for per-value aligned-text memoization. */
const ALIGNED_TEXT_CACHE: unique symbol = Symbol("undent.alignedTextCache");

// Character codes used in hot loops.
// Hex is compact for low-level scanning, so we document each value:
// - 0x09 = TAB      (decimal 9)
// - 0x0A = LF  \n   (decimal 10)
// - 0x0D = CR  \r   (decimal 13)
// - 0x20 = SPACE    (decimal 32)
const CC_TAB = 0x09; // TAB
const CC_LF = 0x0a; // LF
const CC_CR = 0x0d; // CR
const CC_SPACE = 0x20; // SPACE

/**
 * Bounded memoization for `embed(value)`.
 *
 * `embed` is commonly used with repeated static snippets (SQL, code blocks,
 * config fragments). Caching the dedented result avoids paying the
 * `dedentString(..., "all", "all")` cost repeatedly for identical inputs.
 */
const EMBED_CACHE_MAX = 256;
const EMBED_CACHE = new Map<string, string>();
const ALIGNED_TEXT_CACHE_MAX = 8;

/**
 * A branded wrapper that tells `undent` to pad subsequent lines of
 * this value to the insertion column. Created by {@link align} and
 * {@link embed}.
 *
 * You don't need to construct this directly — use the helper
 * functions instead.
 */
export interface AlignedValue {
  /** Brand marker. Always `true` for values created by {@link align} or {@link embed}. */
  readonly [ALIGNED]: true;
  /** The stringified content, ready for insertion into the template output. */
  readonly value: string;
}

interface InternalAlignedValue extends AlignedValue {
  [ALIGNED_TEXT_CACHE]?: Map<string, string>;
}

/**
 * Mark an interpolated value for column alignment.
 *
 * When a multi-line value is interpolated, its second and subsequent
 * lines normally start at column 0 — breaking the visual structure.
 * Wrapping it with `align()` pads those lines to match the insertion
 * column:
 *
 * ```
 * Without align():          With align():
 *
 * list:                     list:
 *   - alpha                   - alpha
 * - beta      ← col 0        - beta       ← stays at col 2
 * - gamma                     - gamma
 * end                       end
 * ```
 *
 * @param value - Any value. It is stringified with `String(value)`.
 * @returns A branded {@link AlignedValue} wrapper.
 *
 * @example Aligning a multi-line list at its insertion column
 * ```ts
 * import { undent, align } from "@okikio/undent";
 *
 * const items = "- alpha\n- beta\n- gamma";
 *
 * undent`
 *   list:
 *     ${align(items)}
 *   end
 * `;
 * // "list:\n  - alpha\n  - beta\n  - gamma\nend"
 * ```
 */
export function align(value: unknown): AlignedValue {
  return { [ALIGNED]: true, value: String(value) };
}

/**
 * Strip a value's own indentation, then mark it for alignment.
 *
 * Use this when the value carries baked-in indent from its source
 * location (a SQL query written as an indented constant, a code block
 * loaded from a file, etc.). `embed()` runs {@link dedentString} on
 * the value first, then wraps the result with {@link align}:
 *
 * ```
 * Input value (4-space indent):      After embed():
 *
 *     SELECT id, name                SELECT id, name
 *     FROM   users                   FROM   users
 *     WHERE  active = true           WHERE  active = true
 * ```
 *
 * Results are cached (up to 256 entries), so repeated calls with the
 * same string are essentially free.
 *
 * @param value - A string with baked-in indentation to strip.
 * @returns A branded {@link AlignedValue} wrapper.
 *
 * @example Embedding an indented SQL query into a template
 * ```ts
 * import { undent, embed } from "@okikio/undent";
 *
 * const sql = `
 *     SELECT id, name
 *     FROM   users
 *     WHERE  active = true
 * `;
 *
 * undent`
 *   query:
 *     ${embed(sql)}
 * `;
 * // "query:\n  SELECT id, name\n  FROM   users\n  WHERE  active = true"
 * ```
 */
export function embed(value: string): AlignedValue {
  return { [ALIGNED]: true, value: dedentStringForEmbed(value) };
}

function dedentStringForEmbed(value: string): string {
  // Step 1: fast-path lookup for repeated snippets.
  // Most embed() calls reuse static SQL/code blocks, so this avoids
  // re-running dedentString(...) when the input is identical.
  const cached = EMBED_CACHE.get(value);
  if (cached !== undefined) return cached;

  // Step 2: compute canonical embedded text once.
  const out = dedentString(value, "all", "all");

  // Step 3: bounded-store policy.
  // - Skip very large inputs to avoid long-lived large-string retention.
  // - Evict oldest entry when cache is full for predictable memory bounds.
  if (value.length <= 64 * 1024) {
    if (EMBED_CACHE.size >= EMBED_CACHE_MAX) {
      const oldest = EMBED_CACHE.keys().next().value;
      if (oldest !== undefined) EMBED_CACHE.delete(oldest);
    }
    EMBED_CACHE.set(value, out);
  }

  return out;
}

/**
 * Type guard: returns `true` if `value` was created by
 * {@link align} or {@link embed}.
 *
 * @example Checking whether a value is wrapped
 * ```ts
 * import { align, isAligned } from "@okikio/undent";
 *
 * isAligned(align("hello")); // true
 * isAligned("hello");        // false
 * ```
 */
export function isAligned(value: unknown): value is AlignedValue {
  return typeof value === "object" && value !== null && ALIGNED in value;
}

// ==========================================================================
// Public API: factory and pre-built instances
// ==========================================================================

/**
 * The default resolved options. Exported so you can inspect or extend
 * the defaults when building custom configuration pipelines.
 *
 * ```ts
 * import { DEFAULTS } from "@okikio/undent";
 *
 * console.log(DEFAULTS.strategy);    // "common"
 * console.log(DEFAULTS.trimLeading); // "all"
 * ```
 */
export const DEFAULTS: ResolvedOptions = {
  strategy: "common",
  trimLeading: "all",
  trimTrailing: "all",
  newline: null,
  alignValues: false,
};

/**
 * Create a new `undent` instance with custom options.
 *
 * Starts from the default settings and applies your overrides. Use
 * this when you want a standalone instance that doesn't inherit from
 * an existing one (unlike `.with()`).
 *
 * @param options - Configuration overrides. Omitted fields use defaults.
 * @returns A new {@link Undent} instance.
 *
 * @example Creating an outdent-compatible instance
 * ```ts
 * import { createUndent } from "@okikio/undent";
 *
 * // Matches the outdent npm package's behavior:
 * const myTag = createUndent({ strategy: "first", trim: "one" });
 *
 * myTag`
 *   first line sets the indent
 *     deeper line stays deeper
 * `;
 * // "first line sets the indent\n  deeper line stays deeper"
 * ```
 */
export function createUndent(options: UndentOptions = {}): Undent {
  return createUndentFromResolved(resolveOptions(DEFAULTS, options));
}

/**
 * Default instance: strips the common indent across all lines and
 * trims all leading/trailing blank lines.
 *
 * This is also the default export.
 *
 * @example Stripping structural indent from a template
 * ```ts
 * import { undent } from "@okikio/undent";
 *
 * undent`
 *   Hello, world!
 * `;
 * // "Hello, world!"
 * ```
 */
export const undent: Undent = createUndentFromResolved(DEFAULTS);

/**
 * Convenience alias for {@link undent}.
 *
 * Some codebases use the name "dedent" by convention. This export
 * lets you import whichever name feels natural:
 *
 * ```ts
 * import { dedent } from "@okikio/undent";
 * ```
 */
export const dedent: Undent = undent;

/**
 * Pre-configured instance that matches classic `outdent` npm behavior:
 * first-line indent detection and trim-one.
 *
 * @example First-line strategy with trim-one
 * ```ts
 * import { outdent } from "@okikio/undent";
 *
 * outdent`
 *   first line sets the indent
 *     deeper line stays deeper
 * `;
 * // "first line sets the indent\n  deeper line stays deeper"
 * ```
 */
export const outdent: Undent = createUndent({
  strategy: "first",
  trim: "one",
});

export default undent;

// ==========================================================================
// Instance construction
//
// Each Undent instance is a plain function with `.with()`, `.string()`,
// and `.indent` attached as properties. UndentState carries the resolved
// options, a self-reference (for anchor detection), and a WeakMap cache
// for processed template segments.
// ==========================================================================

interface UndentState {
  tag: Undent | null;
  opts: ResolvedOptions;
  cache: WeakMap<TemplateStringsArray, CacheEntry>;
}

interface CacheEntry {
  normal?: string[];
  anchored?: string[];
}

function createUndentFromResolved(opts: ResolvedOptions): Undent {
  const state: UndentState = {
    tag: null,
    opts,
    cache: new WeakMap(),
  };

  state.tag = function _tag(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) {
    return undentTag(state, strings, ...values);
  } as Undent;

  state.tag.with = function _with(next: UndentOptions) {
    return undentWith(state, next);
  } as Undent["with"];

  state.tag.string = function _string(input: string) {
    return undentStringMethod(state, input);
  } as Undent["string"];

  Object.defineProperty(state.tag, "indent", {
    value: indent,
    enumerable: true,
    writable: false,
    configurable: false,
  });

  return state.tag;
}

function undentWith(state: UndentState, next: UndentOptions): Undent {
  return createUndentFromResolved(resolveOptions(state.opts, next));
}

function undentStringMethod(state: UndentState, input: string): string {
  const { trimLeading, trimTrailing, newline } = state.opts;
  let out = dedentString(input, trimLeading, trimTrailing);
  if (typeof newline === "string") {
    out = out.replace(ANY_NEWLINE, newline);
  }
  return out;
}

/**
 * Core tag function. Checks for an indent anchor, retrieves (or
 * computes and caches) processed segments, then joins segments with
 * values using either the plain or alignment-aware path.
 *
 * When `alignValues` is false (the common case), alignment is checked
 * inline during the join loop. If a wrapped value is encountered
 * mid-join, we restart with the alignment-aware path. This avoids a
 * separate `some(isAligned)` scan on every call.
 */
function undentTag(
  state: UndentState,
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  const anchorCol = anchorColumn(state.tag, strings, values);
  const anchored = anchorCol >= 0;
  const segments = getProcessedSegments(state, strings, anchorCol);
  const effectiveValues = anchored ? values.slice(1) : values;
  const valLen = effectiveValues.length;

  if (valLen === 0) return segments[0] ?? "";

  // Fast path: when alignValues is true, always use aligned join.
  if (state.opts.alignValues) {
    return joinAligned(segments, effectiveValues, true);
  }

  // Common path: try plain join, bail to aligned if we hit a wrapped value.
  // Inline the isAligned check during concatenation to avoid a separate scan.
  let out = segments[0] ?? "";
  for (let i = 0; i < valLen; i++) {
    const raw = effectiveValues[i];
    if (typeof raw === "object" && raw !== null && ALIGNED in raw) {
      // Found an aligned value — switch to aligned join for entire template.
      return joinAligned(segments, effectiveValues, false);
    }
    out += String(raw) + (segments[i + 1] ?? "");
  }
  return out;
}

// ==========================================================================
// Options resolution
//
// resolveOptions() takes a fully resolved base and user overrides,
// producing a new ResolvedOptions. Powers both createUndent()
// (base = DEFAULTS) and .with() (base = parent's options).
// ==========================================================================

/**
 * Merge user options onto a resolved base, producing a new
 * {@link ResolvedOptions}.
 *
 * This powers both {@link createUndent} (base = {@link DEFAULTS})
 * and `.with()` (base = parent's options). Exported for consumers
 * who want to build custom configuration pipelines.
 *
 * @param base - The fully resolved starting options.
 * @param options - User overrides to apply on top of `base`.
 * @returns A new {@link ResolvedOptions} with overrides merged in.
 *
 * @example Merging custom options with defaults
 * ```ts
 * import { resolveOptions, DEFAULTS } from "@okikio/undent";
 *
 * const opts = resolveOptions(DEFAULTS, { strategy: "first" });
 * console.log(opts.strategy); // "first"
 * console.log(opts.trimLeading); // "all" (inherited from DEFAULTS)
 * ```
 */
export function resolveOptions(
  base: ResolvedOptions,
  options: UndentOptions,
): ResolvedOptions {
  const resolved: ResolvedOptions = { ...base };

  if (options.strategy !== undefined) resolved.strategy = options.strategy;
  if (options.alignValues !== undefined) {
    resolved.alignValues = options.alignValues;
  }

  if (options.newline !== undefined) {
    if (options.newline === null) resolved.newline = null;
    else if (typeof options.newline === "string") {
      resolved.newline = options.newline;
    } else throw new TypeError(`undent: "newline" must be a string or null`);
  }

  if (options.trim !== undefined) {
    if (typeof options.trim === "string") {
      resolved.trimLeading = options.trim;
      resolved.trimTrailing = options.trim;
    } else {
      resolved.trimLeading = options.trim.leading ?? "all";
      resolved.trimTrailing = options.trim.trailing ?? "all";
    }
  }

  return resolved;
}

// ==========================================================================
// Template pipeline: detect indent → strip → trim → normalize
//
// Each template literal has a frozen TemplateStringsArray identity,
// so processed segments are cached per call site. Anchored vs. normal
// calls produce different results from the same template, so both
// variants are stored in one CacheEntry.
// ==========================================================================

/**
 * Retrieve processed segments from cache, or compute them.
 *
 * Pipeline:
 * 1. If anchored, drop strings[0] (consumed by the anchor marker)
 *    and use the anchor's column as the indent level.
 * 2. Otherwise, detect indent level (common or first-line strategy).
 * 3. Strip indent, trim wrapper lines, normalize newlines.
 */
function getProcessedSegments(
  state: UndentState,
  strings: TemplateStringsArray,
  anchorCol: number,
): string[] {
  const anchored = anchorCol >= 0;

  let entry = state.cache.get(strings);
  if (!entry) {
    entry = {};
    state.cache.set(strings, entry);
  }

  const cached = anchored ? entry.anchored : entry.normal;
  if (cached) return cached;

  const effectiveStrings = anchored
    ? Array.prototype.slice.call(strings, 1) as string[]
    : strings;

  // When anchored, the anchor's column IS the indent level — content
  // keeps its spacing relative to the anchor. When not anchored, we
  // auto-detect the minimum indent from the content itself.
  const indentCount = anchored
    ? anchorCol
    : state.opts.strategy === "first"
    ? detectFirstIndent(effectiveStrings)
    : detectCommonIndent(effectiveStrings);

  const processed = processStrings(effectiveStrings, indentCount, state.opts);

  if (anchored) entry.anchored = processed;
  else entry.normal = processed;

  return processed;
}

/**
 * Detect whether this is an anchored call and return the anchor's
 * column position. Returns -1 if not anchored.
 *
 * An anchored call uses the indent symbol (or the tag itself, for
 * outdent backward compat) as the first interpolation, placed alone
 * on its own line. The anchor's column — whitespace after the last
 * newline in strings[0] — becomes the indent baseline. Content keeps
 * its spacing relative to that column.
 *
 * Five conditions must all hold:
 * 1. At least one interpolated value exists.
 * 2. The first value is the `indent` symbol or the tag itself.
 * 3. Everything before the marker (strings[0]) is whitespace + newlines.
 * 4. strings[0] contains at least one newline.
 * 5. strings[1] starts with a newline or is empty (the marker is on
 *    its own line, not `text ${indent} more text`).
 */
function anchorColumn(
  tag: Undent | null,
  strings: TemplateStringsArray,
  values: ReadonlyArray<unknown>,
): number {
  if (!tag || values.length === 0) return -1;

  const v0 = values[0];
  if (v0 !== indent && v0 !== tag) return -1;

  const s0 = strings[0];
  let hasNl = false;
  let colAfterLastNl = 0;
  for (let i = 0; i < s0.length; i++) {
    const c = s0.charCodeAt(i);
    if (c === CC_LF || c === CC_CR) {
      hasNl = true;
      colAfterLastNl = 0;
      // Skip \n in \r\n so it counts as one newline.
      if (c === CC_CR && i + 1 < s0.length && s0.charCodeAt(i + 1) === CC_LF) {
        i++;
      }
      continue;
    }
    if (c === CC_SPACE || c === CC_TAB) {
      colAfterLastNl++;
      continue;
    }
    return -1; // non-whitespace content before marker
  }
  if (!hasNl) return -1;

  if (strings.length < 2) return -1;
  const s1 = strings[1];
  if (s1.length === 0) return colAfterLastNl;
  const c0 = s1.charCodeAt(0);
  return (c0 === CC_LF || c0 === CC_CR) ? colAfterLastNl : -1;
}

// --- Indent detection ----------------------------------------------------
//
// Scans template segments character-by-character to find the indent
// level. A "content line" starts after a newline, has some leading
// whitespace, and is followed by non-whitespace (or end-of-segment
// where an interpolation sits).
//
// The scanner is a tiny state machine:
//   1. Find a newline (\n, \r, or \r\n).
//   2. Count consecutive space/tab characters after it.
//   3. Check what follows: content? another newline? end-of-segment?
//
// `endIsContent` is true for non-last segments because the segment
// boundary means an interpolation expression follows.

/**
 * Find the minimum indentation across all content lines in all segments.
 *
 * If no content lines exist (e.g. a whitespace-only template), falls
 * back to measuring the trailing whitespace in the last segment. This
 * handles templates like `` undent`\n      ` `` where the only indent
 * signal is the closing backtick line.
 */
function detectCommonIndent(strings: ReadonlyArray<string>): number {
  let min = Infinity;
  const last = strings.length - 1;

  for (let si = 0; si <= last; si++) {
    min = Math.min(min, minIndentInSegment(strings[si] ?? "", si < last));
  }

  if (!Number.isFinite(min)) {
    // No content lines at all. Check for trailing indent in last segment.
    const trailing = trailingIndentInSegment(strings[last] ?? "");
    if (trailing > 0) return trailing;
    return 0;
  }

  return min;
}

/**
 * Find the indent of the first content line after a newline.
 *
 * Falls back to trailing indent in the last segment when no content
 * lines exist, same as {@link detectCommonIndent}.
 */
function detectFirstIndent(strings: ReadonlyArray<string>): number {
  const last = strings.length - 1;

  for (let si = 0; si <= last; si++) {
    const ind = firstIndentInSegment(strings[si] ?? "", si < last);
    if (ind >= 0) return ind;
  }

  const trailing = trailingIndentInSegment(strings[last] ?? "");
  return trailing > 0 ? trailing : 0;
}

/**
 * Scan a single segment for the minimum indent across all its content
 * lines. Returns `Infinity` if no content lines exist in this segment.
 *
 * Walk character by character. When we hit a newline, count whitespace
 * after it. If non-whitespace follows (or end-of-segment with
 * `endIsContent`), record it as a content line's indent level.
 */
function minIndentInSegment(segment: string, endIsContent: boolean): number {
  let min = Infinity;

  // Micro-opt: inline newline detection instead of newlineLengthAt(...)
  // function calls in this hot loop. Behavior remains identical:
  // - '\n' => length 1
  // - '\r\n' => length 2
  // - '\r' => length 1
  for (let i = 0; i < segment.length; i++) {
    const newlineChar = segment.charCodeAt(i);
    if (newlineChar !== CC_LF && newlineChar !== CC_CR) continue;

    const newlineLength = newlineChar === CC_CR && i + 1 < segment.length &&
        segment.charCodeAt(i + 1) === CC_LF
      ? 2
      : 1;

    // Found a newline. Count whitespace after it.
    let j = i + newlineLength;
    let ind = 0;
    while (j < segment.length) {
      const whitespaceChar = segment.charCodeAt(j);
      if (whitespaceChar !== CC_SPACE && whitespaceChar !== CC_TAB) break;
      ind++;
      j++;
    }

    if (j < segment.length) {
      // Something follows the whitespace. If it's content (not another
      // newline), this line's indent participates in the minimum.
      const nextChar = segment.charCodeAt(j);
      if (nextChar !== CC_LF && nextChar !== CC_CR) {
        min = Math.min(min, ind);
      }
    } else if (endIsContent) {
      // End of segment, but an interpolation follows. The whitespace
      // is the indent before that interpolated value.
      min = Math.min(min, ind);
    }
    // else: end of last segment. Trailing whitespace here is the closing
    // backtick line, handled by the fallback in detectCommonIndent.

    // Skip past the whitespace we already scanned.
    i = j - 1;
  }

  return min;
}

/**
 * Like {@link minIndentInSegment} but returns the FIRST content line's
 * indent instead of the minimum. Returns -1 if no content lines exist.
 */
function firstIndentInSegment(segment: string, endIsContent: boolean): number {
  // Same inlined newline detection rationale as minIndentInSegment.
  for (let i = 0; i < segment.length; i++) {
    const newlineChar = segment.charCodeAt(i);
    if (newlineChar !== CC_LF && newlineChar !== CC_CR) continue;

    const newlineLength = newlineChar === CC_CR && i + 1 < segment.length &&
        segment.charCodeAt(i + 1) === CC_LF
      ? 2
      : 1;

    let j = i + newlineLength;
    let ind = 0;
    while (j < segment.length) {
      const whitespaceChar = segment.charCodeAt(j);
      if (whitespaceChar !== CC_SPACE && whitespaceChar !== CC_TAB) break;
      ind++;
      j++;
    }

    if (j < segment.length) {
      const nextChar = segment.charCodeAt(j);
      if (nextChar !== CC_LF && nextChar !== CC_CR) return ind;
    } else if (endIsContent) {
      return ind;
    }

    i = j - 1;
  }

  return -1;
}

/**
 * Fallback for whitespace-only templates. Scans backwards from the end
 * of the segment to find the last newline, then returns the count of
 * whitespace characters between it and the end.
 *
 * Returns 0 if the segment ends with a bare newline (blank closing
 * line) or -1 if no newline exists in the segment.
 */
function trailingIndentInSegment(segment: string): number {
  let count = 0;
  for (let i = segment.length - 1; i >= 0; i--) {
    const c = segment.charCodeAt(i);
    if (c === CC_SPACE || c === CC_TAB) {
      count++;
      continue;
    }
    if (c === CC_LF || c === CC_CR) return count;
    return -1; // non-whitespace before any newline
  }
  return -1; // no newline found
}

// --- Segment processing --------------------------------------------------

const ANY_NEWLINE = /\r\n|\r|\n/g;
const LEADING_ONE = /^[ \t]*(?:\r\n|\r|\n)/;
const TRAILING_ONE = /(?:\r\n|\r|\n)[ \t]*$/;
const LEADING_ALL = /^(?:[ \t]*(?:\r\n|\r|\n))+/;
const TRAILING_ALL = /(?:(?:\r\n|\r|\n)[ \t]*)+$/;

/**
 * Cache strip-indentation regexes keyed by indent width.
 *
 * Why: compiling `new RegExp(...)` on every `.string()`/tag call adds
 * avoidable overhead on hot paths. The pattern is deterministic for a
 * given indent width, so we compile once and reuse.
 *
 * Bounded at 128 entries. Real-world indent widths cluster around 2–8,
 * so the cap is rarely reached. Without a bound, adversarially varied
 * indent widths (e.g. server-rendered user-supplied code blocks) could
 * grow the cache without limit.
 */
const STRIP_REGEX_CACHE_MAX = 128;
const STRIP_REGEX_CACHE = new Map<number, RegExp>();

/**
 * Return a cached strip-indentation regex for a specific indent count.
 *
 * Pattern shape:
 * - `(\r\n|\r|\n)` captures the exact newline sequence.
 * - `[ \t]{0,N}` removes up to N indentation chars after that newline.
 *
 * Replacement uses `$1`, so the newline is preserved byte-for-byte.
 */
function getStripIndentRegex(indentCount: number): RegExp {
  let re = STRIP_REGEX_CACHE.get(indentCount);
  if (!re) {
    re = new RegExp(`(\\r\\n|\\r|\\n)[ \\t]{0,${indentCount}}`, "g");
    if (STRIP_REGEX_CACHE.size >= STRIP_REGEX_CACHE_MAX) {
      const oldest = STRIP_REGEX_CACHE.keys().next().value;
      if (oldest !== undefined) STRIP_REGEX_CACHE.delete(oldest);
    }
    STRIP_REGEX_CACHE.set(indentCount, re);
  }
  return re;
}

/**
 * Process an array of template segments through the strip → trim →
 * normalize pipeline.
 *
 * **Stripping** uses a regex `(\r\n|\r|\n)[ \t]{0,N}` where N is the
 * detected indent. The `{0,N}` quantifier is key: it only consumes
 * whitespace, and at most N characters of it, so content is never
 * destroyed even if a line has less indent than expected.
 *
 * **Trimming** removes wrapper blank lines from the first and last
 * segments using the configured trim mode.
 *
 * **Normalization** replaces newline sequences in segments only.
 * Interpolated values are joined separately and never normalized.
 */
function processStrings(
  strings: ReadonlyArray<string>,
  indentCount: number,
  opts: ResolvedOptions,
): string[] {
  const strip = indentCount > 0 ? getStripIndentRegex(indentCount) : null;

  const out: string[] = new Array(strings.length);
  const last = strings.length - 1;

  for (let i = 0; i < strings.length; i++) {
    let s = strings[i] ?? "";

    if (strip) s = s.replace(strip, "$1");

    if (i === 0 && opts.trimLeading !== "none") {
      s = opts.trimLeading === "all"
        ? s.replace(LEADING_ALL, "")
        : s.replace(LEADING_ONE, "");
    }

    if (i === last && opts.trimTrailing !== "none") {
      s = opts.trimTrailing === "all"
        ? s.replace(TRAILING_ALL, "")
        : s.replace(TRAILING_ONE, "");
    }

    // Edge case: a single-segment whitespace-only template (like
    // `undent` \n      ` `) may have its newlines stripped by leading
    // trim but retain residual whitespace that trailing trim can't
    // catch (TRAILING_ALL requires a preceding newline). If both sides
    // trim "all" and only whitespace remains, it's empty content.
    if (
      i === 0 && i === last &&
      opts.trimLeading === "all" && opts.trimTrailing === "all" &&
      s.length > 0 && s.trim().length === 0
    ) {
      s = "";
    }

    if (typeof opts.newline === "string") {
      s = s.replace(ANY_NEWLINE, opts.newline);
    }

    out[i] = s;
  }

  return out;
}

// ==========================================================================
// String-safe dedent (arbitrary strings)
//
// Unlike the template pipeline (which relies on the structural split
// between segments and values), dedentString handles arbitrary input:
//
// 1. Scan every non-blank line for the minimum leading whitespace.
// 2. Strip that many characters from the front of each line.
// 3. Trim wrapper blank lines using the configured mode.
// 4. Preserve original newline sequences byte-for-byte.
// ==========================================================================

/**
 * Strip common leading indentation from a plain string.
 *
 * This is the algorithm behind `.string()` and {@link embed}. It scans
 * every non-blank line for the smallest indent and strips it. Only
 * whitespace is ever removed — content is guaranteed safe.
 *
 * Two-pass approach:
 *
 * 1. **Scan** — walk each line, count leading spaces/tabs on non-blank
 *    lines, track the minimum.
 * 2. **Strip** — remove up to `minIndent` characters from each line.
 *    The first line is sliced directly; remaining lines use a cached
 *    regex so newline bytes are preserved.
 * 3. **Trim** — apply leading/trailing blank-line trimming.
 *
 * Original newline sequences (`\n`, `\r\n`, `\r`) pass through
 * unchanged. Lines with less indent than the minimum lose only what
 * they have.
 *
 * @param input - The string to strip indent from.
 * @param trimLeading - How to handle leading blank lines.
 * @param trimTrailing - How to handle trailing blank lines.
 * @returns The dedented string.
 *
 * @example Stripping indent from a SQL string
 * ```ts
 * import { dedentString } from "@okikio/undent";
 *
 * const clean = dedentString(`
 *     SELECT *
 *     FROM users
 * `);
 * // "SELECT *\nFROM users"
 * ```
 *
 * @example Edge case — mixed indent depths:
 * ```ts
 * import { dedentString } from "@okikio/undent";
 *
 * dedentString("    deep\n  shallow");
 * // "  deep\nshallow"
 * // 2 spaces stripped (the minimum); "deep" keeps its extra 2.
 * ```
 */
export function dedentString(
  input: string,
  trimLeading: TrimMode = "all",
  trimTrailing: TrimMode = "all",
): string {
  const len = input.length;
  if (len === 0) return "";

  // Pass 1: find minimum indent across non-blank lines.
  // Blank lines do not influence minIndent; they are structural only.
  let minIndent = Infinity;
  let lineStart = 0;
  while (lineStart < len) {
    // Step 1: Count leading horizontal whitespace on this logical line.
    let i = lineStart;
    while (i < len) {
      const c = input.charCodeAt(i);
      if (c !== CC_SPACE && c !== CC_TAB) break;
      i++;
    }

    // Step 2: If non-whitespace content follows, include this line in minIndent.
    if (i < len) {
      const c = input.charCodeAt(i);
      if (c !== CC_LF && c !== CC_CR) {
        const ws = i - lineStart;
        if (ws < minIndent) {
          minIndent = ws;
          if (ws === 0) break; // Can't go lower.
        }
      }
    } else {
      // Last line contained only spaces/tabs and no newline.
      break;
    }

    // Step 3: Advance to the start of the next logical line.
    while (i < len) {
      const c = input.charCodeAt(i);
      if (c === CC_LF) {
        i++;
        break;
      }
      if (c === CC_CR) {
        i++;
        if (i < len && input.charCodeAt(i) === CC_LF) i++;
        break;
      }
      i++;
    }

    lineStart = i;
  }

  // No content lines — input is all whitespace/newlines
  if (minIndent === Infinity) {
    if (trimLeading === "all" && trimTrailing === "all") return "";
    minIndent = 0;
  }

  // Pass 2: strip indent while preserving exact newline bytes.
  // We handle the first line separately because the regex only targets
  // indentation immediately following newline sequences.
  let result = input;

  if (minIndent > 0) {
    // Strip first line's leading whitespace (up to minIndent chars)
    let firstWs = 0;
    while (firstWs < minIndent && firstWs < len) {
      const c = input.charCodeAt(firstWs);
      if (c !== CC_SPACE && c !== CC_TAB) break;
      firstWs++;
    }
    // Strip subsequent lines' indent with regex (matches processStrings)
    const reStrip = getStripIndentRegex(minIndent);
    result = (firstWs > 0 ? input.slice(firstWs) : input).replace(
      reStrip,
      "$1",
    );
  }

  // Pass 3: compute trim boundaries, then slice once.
  // Returning numeric boundaries from helpers avoids extra intermediate
  // strings from chained regex replacements.
  const start = trimLeading === "none"
    ? 0
    : trimLeading === "all"
    ? trimLeadingBlankLinesAll(result)
    : trimLeadingBlankLinesOne(result);

  const end = trimTrailing === "none"
    ? result.length
    : trimTrailing === "all"
    ? trimTrailingBlankLinesAll(result)
    : trimTrailingBlankLinesOne(result);

  if (start >= end) return "";

  if (start !== 0 || end !== result.length) {
    result = result.slice(start, end);
  }

  return result;
}

/**
 * Trim mode "one" for the leading edge.
 *
 * Removes at most one leading blank line, where a "blank line" is:
 * optional horizontal whitespace + one newline sequence.
 *
 * Returns the start index to slice from.
 */
function trimLeadingBlankLinesOne(text: string): number {
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text.charCodeAt(i);
    if (c !== CC_SPACE && c !== CC_TAB) break;
    i++;
  }

  if (i >= len) return 0;
  const nlLen = newlineLengthAt(text, i);
  return nlLen > 0 ? i + nlLen : 0;
}

/**
 * Trim mode "all" for the leading edge.
 *
 * Repeatedly consumes leading blank lines until the first content line
 * (or end-of-string), then returns the start index to slice from.
 */
function trimLeadingBlankLinesAll(text: string): number {
  let start = 0;
  while (start < text.length) {
    let i = start;
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c !== CC_SPACE && c !== CC_TAB) break;
      i++;
    }
    const nlLen = newlineLengthAt(text, i);
    if (nlLen === 0) return start;
    start = i + nlLen;
  }
  return start;
}

/**
 * Trim mode "one" for the trailing edge.
 *
 * Removes at most one trailing blank line, where a "blank line" is:
 * one newline sequence preceded/followed by optional spaces/tabs.
 *
 * Returns the exclusive end index to slice to.
 */
function trimTrailingBlankLinesOne(text: string): number {
  let i = text.length - 1;
  while (i >= 0) {
    const c = text.charCodeAt(i);
    if (c !== CC_SPACE && c !== CC_TAB) break;
    i--;
  }

  if (i < 0) return text.length;

  const c = text.charCodeAt(i);
  if (c === CC_LF) {
    return i > 0 && text.charCodeAt(i - 1) === CC_CR ? i - 1 : i;
  }
  if (c === CC_CR) return i;
  return text.length;
}

/**
 * Trim mode "all" for the trailing edge.
 *
 * Walks backward in blank-line sized chunks until content is reached.
 * Handles `\n`, `\r\n`, and `\r` explicitly so newline preservation
 * remains exact and deterministic.
 *
 * Returns the exclusive end index to slice to.
 */
function trimTrailingBlankLinesAll(text: string): number {
  let end = text.length;

  while (end > 0) {
    let i = end - 1;
    while (i >= 0) {
      const c = text.charCodeAt(i);
      if (c !== CC_SPACE && c !== CC_TAB) break;
      i--;
    }

    if (i < 0) return 0;

    const c = text.charCodeAt(i);
    if (c === CC_LF) {
      end = i > 0 && text.charCodeAt(i - 1) === CC_CR ? i - 1 : i;
      continue;
    }
    if (c === CC_CR) {
      end = i;
      continue;
    }
    return end;
  }

  return end;
}

// ==========================================================================
// Joining: plain vs. alignment-aware
//
// The plain path interleaves segments and stringified values.
//
// The alignment-aware path computes a padding string for each value
// by measuring the column offset (characters since the last newline)
// in the accumulated output. This padding is prepended to subsequent
// lines in multi-line values, keeping them visually aligned under
// their insertion point.
// ==========================================================================

/**
 * Join segments and values with alignment support.
 *
 * Values wrapped by {@link align} or {@link embed} always get aligned.
 * When `alignAll` is true, unwrapped multi-line values are aligned too.
 *
 * For each interpolation:
 * 1. Compute the insertion column from the current output.
 * 2. If the value is wrapped, pad subsequent lines and cache the result.
 * 3. If `alignAll` and the value is multi-line, pad subsequent lines.
 * 4. Otherwise, stringify and concatenate directly.
 */
function joinAligned(
  strings: ReadonlyArray<string>,
  values: ReadonlyArray<unknown>,
  alignAll: boolean,
): string {
  let out = strings[0] ?? "";

  for (let i = 1; i < strings.length; i++) {
    const raw = values[i - 1];
    const wrapped = isAligned(raw);
    const text = wrapped ? raw.value : String(raw);

    if (wrapped) {
      // Wrapped values always align. For hot loops with repeated values,
      // this path memoizes alignment by pad width and reuses results.
      const pad = " ".repeat(columnOffset(out));
      out += getAlignedWrappedText(raw, pad);
    } else if (alignAll && hasNewline(text)) {
      out += alignText(text, " ".repeat(columnOffset(out)));
    } else {
      out += text;
    }

    out += strings[i] ?? "";
  }

  return out;
}

/**
 * Pad subsequent lines of a multi-line string with a prefix.
 *
 * The first line is left unchanged (it's already at the insertion
 * point). Blank or whitespace-only lines are skipped to avoid
 * producing trailing whitespace. Original newline sequences are
 * preserved.
 *
 * Uses a character-level scanner instead of regex/split to minimize
 * allocations on large inputs.
 *
 * @param text - The multi-line string to align.
 * @param pad - A string (usually spaces) to prepend to lines 2+.
 * @returns The aligned string.
 *
 * @example Padding subsequent lines with a two-space prefix
 * ```ts
 * import { alignText } from "@okikio/undent";
 *
 * alignText("a\nb\nc", "  ");
 * // "a\n  b\n  c"
 *
 * alignText("a\r\nb\rc", "  ");
 * // "a\r\n  b\r  c"  — newline sequences preserved byte-for-byte
 * ```
 *
 * @example Blank and whitespace-only lines are never padded
 * ```ts
 * import { alignText } from "@okikio/undent";
 *
 * alignText("a\n\nc", "  ");
 * // "a\n\n  c"  — blank line in the middle is left unchanged
 *
 * alignText("a\n   \nc", "  ");
 * // "a\n   \n  c"  — whitespace-only line is also left unchanged
 * ```
 */
export function alignText(text: string, pad: string): string {
  if (pad.length === 0 || text.length === 0) {
    return text;
  }

  if (text.indexOf("\n") === -1 && text.indexOf("\r") === -1) {
    return text;
  }

  // Scanner-based alignment (instead of regex callback) to reduce
  // allocation churn on large multi-line values.
  //
  // Invariants preserved:
  // - first line unchanged,
  // - newline bytes preserved exactly,
  // - blank/whitespace-only lines remain unpadded.
  const len = text.length;
  let i = 0;
  let last = 0;
  let parts: string[] | null = null;

  while (i < len) {
    const c = text.charCodeAt(i);
    if (c !== CC_LF && c !== CC_CR) {
      i++;
      continue;
    }

    const lineStart =
      c === CC_CR && i + 1 < len && text.charCodeAt(i + 1) === CC_LF
        ? i + 2
        : i + 1;

    let j = lineStart;
    let hasContent = false;
    while (j < len) {
      const cc = text.charCodeAt(j);
      if (cc === CC_LF || cc === CC_CR) break;
      if (cc !== CC_SPACE && cc !== CC_TAB) hasContent = true;
      j++;
    }

    if (hasContent) {
      if (parts === null) parts = [];
      // Copy unchanged span up to the line start, inject padding,
      // then copy the line content. This keeps transformations local.
      parts.push(text.slice(last, lineStart), pad, text.slice(lineStart, j));
      last = j;
    }

    i = j;
  }

  if (parts === null) return text;
  parts.push(text.slice(last));
  return parts.join("");
}

/** Return true if text contains any supported newline sequence. */
function hasNewline(text: string): boolean {
  return text.indexOf("\n") !== -1 || text.indexOf("\r") !== -1;
}

/**
 * Return aligned text for a wrapped value, using a small per-value
 * cache keyed by the pad string.
 *
 * Targets hot `embed(...)` loops where both the value and insertion
 * column repeat across iterations. Cache is bounded to
 * {@link ALIGNED_TEXT_CACHE_MAX} entries per wrapped value.
 */
function getAlignedWrappedText(value: AlignedValue, pad: string): string {
  const text = value.value;
  if (pad.length === 0 || !hasNewline(text)) {
    return text;
  }

  const internal = value as InternalAlignedValue;
  let cache = internal[ALIGNED_TEXT_CACHE];
  if (cache) {
    const hit = cache.get(pad);
    if (hit !== undefined) return hit;
  }

  const aligned = alignText(text, pad);

  if (!cache) {
    cache = new Map<string, string>();
    internal[ALIGNED_TEXT_CACHE] = cache;
  }

  if (cache.size >= ALIGNED_TEXT_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  cache.set(pad, aligned);
  return aligned;
}

// ==========================================================================
// Shared primitives
//
// Small functions for newline handling and split/join patterns, used
// across both the template and string pipelines.
// ==========================================================================

/**
 * Split a string into lines and their separators, preserving the exact
 * newline sequences (`\n`, `\r\n`, `\r`).
 *
 * Returns two arrays: `lines` (the content between newlines) and
 * `seps` (the newline sequences). They satisfy
 * `lines.length === seps.length + 1`, and the original string can be
 * reconstructed with {@link rejoinLines}.
 *
 * Pre-counts newlines to allocate arrays exactly, avoiding repeated
 * resizing. On 1K-line inputs this is ~2x faster than regex split.
 *
 * @param text - The string to split.
 * @returns An object with `lines` and `seps` arrays.
 *
 * @example Splitting a string while preserving newline sequences
 * ```ts
 * import { splitLines } from "@okikio/undent";
 *
 * const { lines, seps } = splitLines("hello\r\nworld\nfoo");
 * // lines: ["hello", "world", "foo"]
 * // seps:  ["\r\n", "\n"]
 * ```
 */
export function splitLines(text: string): { lines: string[]; seps: string[] } {
  const len = text.length;

  // Fast count newlines for pre-allocation
  let nlCount = 0;
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a) nlCount++;
    else if (c === 0x0d) {
      nlCount++;
      if (i + 1 < len && text.charCodeAt(i + 1) === 0x0a) i++;
    }
  }

  const lines = new Array<string>(nlCount + 1);
  const seps = new Array<string>(nlCount);
  let lineIdx = 0;
  let lineStart = 0;

  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);

    if (c === 0x0a) {
      lines[lineIdx] = text.slice(lineStart, i);
      seps[lineIdx] = "\n";
      lineIdx++;
      lineStart = i + 1;
    } else if (c === 0x0d) {
      lines[lineIdx] = text.slice(lineStart, i);
      if (i + 1 < len && text.charCodeAt(i + 1) === 0x0a) {
        seps[lineIdx] = "\r\n";
        i++; // skip the \n in \r\n
      } else {
        seps[lineIdx] = "\r";
      }
      lineIdx++;
      lineStart = i + 1;
    }
  }

  // Final line (after the last newline, or the entire string if no newlines).
  lines[lineIdx] = text.slice(lineStart);

  return { lines, seps };
}

/**
 * Reconstruct a string from the output of {@link splitLines}.
 *
 * Interleaves lines and separators with a single `join("")` call,
 * which V8 optimizes by pre-computing total length and copying once.
 *
 * @param lines - The content lines.
 * @param seps - The newline separators between lines.
 * @returns The reconstructed string.
 *
 * @example Round-tripping through split and rejoin
 * ```ts
 * import { splitLines, rejoinLines } from "@okikio/undent";
 *
 * const { lines, seps } = splitLines("a\nb\nc");
 * rejoinLines(lines, seps); // "a\nb\nc"
 * ```
 */
export function rejoinLines(
  lines: ReadonlyArray<string>,
  seps: ReadonlyArray<string>,
): string {
  const lineCount = lines.length;
  if (lineCount === 0) return "";
  if (lineCount === 1) return lines[0] ?? "";

  // Interleave: [line0, sep0, line1, sep1, ..., lineN]
  const parts = new Array(lineCount + lineCount - 1);
  parts[0] = lines[0] ?? "";
  for (let i = 1; i < lineCount; i++) {
    const j = (i << 1) - 1; // 2*i - 1
    parts[j] = seps[i - 1] ?? "\n";
    parts[j + 1] = lines[i] ?? "";
  }
  return parts.join("");
}

/**
 * Count characters from the last newline to the end of the string.
 *
 * This gives the "column offset" — the horizontal position where the
 * next character would appear. Used internally by alignment to decide
 * how many spaces to pad.
 *
 * Uses `lastIndexOf` (implemented in C++ by V8) instead of a charcode
 * loop for ~100x speedup on long strings.
 *
 * @param text - The string to measure.
 * @returns The number of characters after the final newline, or the
 *   full string length if there are no newlines.
 *
 * @example Measuring the insertion column
 * ```ts
 * import { columnOffset } from "@okikio/undent";
 *
 * columnOffset("abc\n  ");    // 2
 * columnOffset("abc\r\n    "); // 4
 * columnOffset("no newline");  // 10
 * ```
 */
export function columnOffset(text: string): number {
  const len = text.length;
  if (len === 0) return 0;

  const lastLF = text.lastIndexOf("\n");
  const lastCR = text.lastIndexOf("\r");
  const lastNL = lastLF > lastCR ? lastLF : lastCR;
  if (lastNL === -1) return len;

  // If the last newline char is '\n' and it is part of '\r\n', count 2.
  if (lastNL === lastLF && lastNL > 0 && text.charCodeAt(lastNL - 1) === 13) {
    return len - (lastNL + 1); // i is '\n', sequence started at i-1, so end is i+1
  }

  // Otherwise it's either '\n' or '\r' alone.
  return len - (lastNL + 1);
}

/**
 * Return the byte length of a newline sequence at position `i`.
 *
 * - `\n` → 1
 * - `\r\n` → 2
 * - `\r` → 1
 * - anything else → 0
 *
 * @param text - The string to inspect.
 * @param i - The character index to check.
 * @returns `0`, `1`, or `2`.
 *
 * @example Detecting different newline sequence lengths
 * ```ts
 * import { newlineLengthAt } from "@okikio/undent";
 *
 * newlineLengthAt("a\nb", 1);   // 1  — plain LF
 * newlineLengthAt("a\r\nb", 1); // 2  — CRLF pair counted as one sequence
 * newlineLengthAt("a\rb", 1);   // 1  — bare CR
 * newlineLengthAt("abc", 1);    // 0  — not a newline character
 * ```
 */
export function newlineLengthAt(text: string, i: number): 0 | 1 | 2 {
  const c = text.charCodeAt(i);
  if (c === 10) return 1; // \n
  if (c !== 13) return 0; // not \r
  // \r
  return i + 1 < text.length && text.charCodeAt(i + 1) === 10 ? 2 : 1;
}
