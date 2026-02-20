/**
 * @module undent
 *
 * A lean, Deno-first dedent/outdent utility with strong TypeScript types,
 * predictable behavior, and first-class support for template composition.
 *
 * When you write multi-line template literals, the source code indentation
 * bleeds into the output. This module strips that structural indent while
 * preserving the relative indentation you actually want. It also trims
 * "wrapper" blank lines (the newline after the backtick and before the
 * closing backtick) and lets you safely embed multi-line interpolated
 * values without losing alignment.
 *
 * Because dedenting never eats non-whitespace characters, newline
 * normalization only touches template segments (never values), and
 * alignment preserves your values' original newline sequences, you can
 * compose templates freely without worrying about corruption.
 *
 * Templates and arbitrary strings use different algorithms. Template
 * literals have structural guarantees from syntax (static segments +
 * interpolated values) that let us dedent the static parts reliably.
 * Arbitrary strings passed to `.string()` can start with content on the
 * first line, use any newline style, and may not follow those assumptions,
 * so they get a dedicated safe algorithm that scans every line.
 */

// ==========================================================================
// Public types
// ==========================================================================

/** Controls how leading/trailing blank lines are handled. */
export type TrimMode = "all" | "one" | "none";

/** Per-side trim control for asymmetric trimming. */
export interface TrimSides {
  leading?: TrimMode;
  trailing?: TrimMode;
}

/**
 * Configuration for indentation stripping, trimming, newline
 * normalization, and value alignment.
 */
export interface UndentOptions {
  /**
   * How indentation is detected from template segments.
   *
   * - `"common"` — minimum indent across all content lines in all segments.
   *   This is the safest default and behaves like classic "dedent".
   * - `"first"` — indent of the first content line after a newline.
   *   This matches many "outdent"-style libraries.
   *
   * @default "common"
   */
  strategy?: "common" | "first";

  /**
   * How leading/trailing blank lines are trimmed from the result.
   *
   * - `"all"` — remove all leading/trailing blank lines.
   * - `"one"` — remove at most one leading and one trailing newline
   *   (plus surrounding whitespace).
   * - `"none"` — keep everything.
   * - `{ leading, trailing }` — control each side independently.
   *
   * @default "all"
   */
  trim?: TrimMode | TrimSides;

  /**
   * Normalize newlines in **template segments** to this string.
   *
   * Set to `null` to preserve original sequences. When set to a string,
   * every `\n`, `\r\n`, and `\r` in template segments is replaced.
   * Newlines inside interpolated values are never normalized.
   *
   * @default null
   */
  newline?: string | null;

  /**
   * When `true`, every multi-line interpolated value has its subsequent
   * lines padded to match the insertion column.
   *
   * Individual values can also be wrapped with {@link align} or
   * {@link embed} for per-value control, regardless of this setting.
   *
   * @default false
   */
  alignValues?: boolean;
}

/** The callable tag with attached helpers. */
export interface Undent {
  /** Use as a tagged template literal. */
  (strings: TemplateStringsArray, ...values: unknown[]): string;

  /** Create a new instance with different options. */
  with(options: UndentOptions): Undent;

  /**
   * Dedent an arbitrary string using the safe all-lines algorithm.
   *
   * Handles first-line indentation correctly, preserves original newline
   * sequences by default, applies this instance's trimming rules, and
   * normalizes newlines if configured.
   */
  string(input: string): string;

  /**
   * Indent anchor marker. Place as the first interpolation on its own
   * line to set the zero-indent reference point explicitly.
   *
   * @example
   * ```ts
   * import { undent } from "./mod.ts";
   *
   * const result = undent`
   *   ${undent.indent}
   *     This becomes column 0.
   *       This stays indented 2 more.
   * `;
   * // "This becomes column 0.\n  This stays indented 2 more."
   * ```
   */
  readonly indent: typeof indent;
}

/**
 * Internal resolved form of {@link UndentOptions} where every field
 * is required and trim sides are split into two fields.
 */
export interface ResolvedOptions {
  strategy: "common" | "first";
  trimLeading: TrimMode;
  trimTrailing: TrimMode;
  newline: string | null;
  alignValues: boolean;
}

// ==========================================================================
// Symbols, wrappers, and value markers
// ==========================================================================

/** Indent anchor symbol. Use `undent.indent` or import directly. */
export const indent: unique symbol = Symbol("undent.indent");

/** Brand for values wrapped by {@link align} or {@link embed}. */
const ALIGNED: unique symbol = Symbol("undent.aligned");

/**
 * A branded wrapper telling the join logic to pad subsequent lines of
 * this value to the insertion column. Created by {@link align} and
 * {@link embed}, consumed by the join functions.
 */
export interface AlignedValue {
  readonly [ALIGNED]: true;
  readonly value: string;
}

/**
 * Mark a value for alignment: subsequent lines of the stringified value
 * are padded to match the insertion column.
 *
 * @example
 * ```ts
 * const items = "- a\n- b\n- c";
 * undent`
 *   list:
 *     ${align(items)}
 *   done
 * `;
 * // "list:\n  - a\n  - b\n  - c\ndone"
 * ```
 */
export function align(value: unknown): AlignedValue {
  return { [ALIGNED]: true, value: String(value) };
}

/**
 * Strip a value's own indentation, then align it. Combines
 * {@link dedentString} with {@link align} in one step.
 *
 * Use when interpolating a snippet that carries baked-in indentation
 * from its original source location.
 *
 * @example
 * ```ts
 * const sql = "    SELECT *\n    FROM users\n    WHERE active";
 * undent`
 *   query:
 *     ${embed(sql)}
 * `;
 * // "query:\n  SELECT *\n  FROM users\n  WHERE active"
 * ```
 */
export function embed(value: string): AlignedValue {
  return { [ALIGNED]: true, value: dedentString(value, "all", "all") };
}

/**
 * Type guard: returns `true` if `value` was created by
 * {@link align} or {@link embed}.
 */
export function isAligned(value: unknown): value is AlignedValue {
  return typeof value === "object" && value !== null && ALIGNED in value;
}

// ==========================================================================
// Public API: factory and pre-built instances
// ==========================================================================

/** Default resolved options. Exported for introspection and extension. */
export const DEFAULTS: ResolvedOptions = {
  strategy: "common",
  trimLeading: "all",
  trimTrailing: "all",
  newline: null,
  alignValues: false,
};

/**
 * Create a configured Undent instance from raw user options.
 *
 * @example
 * ```ts
 * const outdentLike = createUndent({ strategy: "first", trim: "one" });
 * ```
 */
export function createUndent(options: UndentOptions = {}): Undent {
  return createUndentFromResolved(resolveOptions(DEFAULTS, options));
}

/** Default instance: common strategy, trim all, no normalization. */
export const undent: Undent = createUndentFromResolved(DEFAULTS);

/** Alias using the common "dedent" terminology. */
export const dedent: Undent = undent;

/**
 * Pre-configured to match classic "outdent" defaults:
 * `strategy: "first"`, `trim: "one"`.
 */
export const outdent: Undent = createUndent({
  strategy: "first",
  trim: "one",
});

export default undent;

// ==========================================================================
// Instance construction via Function.prototype.bind
//
// Each Undent instance is a bound function with methods attached.
// The UndentState carries the resolved options, a self-reference for
// anchor detection, and a WeakMap cache for processed template segments.
// Using bind() avoids creating closures inside closures while keeping
// each instance lightweight.
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

  state.tag = function _tag(strings: TemplateStringsArray, ...values: unknown[]) {
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
 * The core tag function. Determines whether the call is anchored,
 * retrieves (or computes + caches) processed segments, then joins
 * with either the plain or alignment-aware strategy.
 *
 * Optimized: when `alignValues` is false (the common case), we avoid
 * the O(n) `some(isAligned)` scan by checking alignment inline during
 * the join. If any aligned value is found, we restart with the
 * alignment-aware path.
 */
function undentTag(state: UndentState, strings: TemplateStringsArray, ...values: unknown[]): string {
  const anchored = isAnchoredCall(state.tag, strings, values);
  const segments = getProcessedSegments(state, strings, anchored);
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
// resolveOptions() takes a base (already-resolved) and a set of user
// overrides, producing a new ResolvedOptions. This powers both
// createUndent() (base = DEFAULTS) and .with() (base = parent's opts).
// ==========================================================================

/**
 * Merge user options onto a resolved base. Exported for consumers who
 * want to build custom configuration pipelines.
 */
export function resolveOptions(base: ResolvedOptions, options: UndentOptions): ResolvedOptions {
  const resolved: ResolvedOptions = { ...base };

  if (options.strategy !== undefined) resolved.strategy = options.strategy;
  if (options.alignValues !== undefined) resolved.alignValues = options.alignValues;

  if (options.newline !== undefined) {
    if (options.newline === null) resolved.newline = null;
    else if (typeof options.newline === "string") resolved.newline = options.newline;
    else throw new TypeError(`undent: "newline" must be a string or null`);
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
// Template pipeline: cache → detect → strip → trim → normalize
//
// Template processing is split into phases that compose linearly.
// getProcessedSegments orchestrates the pipeline and manages the
// WeakMap cache. Each template literal has a frozen TemplateStringsArray
// identity, so we cache processed segments keyed on that identity.
// Anchored vs normal calls produce different results from the same
// template, so we store both variants in a single CacheEntry.
// ==========================================================================

/**
 * Retrieve processed segments from cache, or compute them. The pipeline:
 * 1. If anchored, slice off strings[0] (consumed by the anchor marker).
 * 2. Detect indent level using the configured strategy.
 * 3. Strip indent, trim wrapper lines, normalize newlines.
 */
function getProcessedSegments(state: UndentState, strings: TemplateStringsArray, anchored: boolean): string[] {
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

  const indentCount = state.opts.strategy === "first"
    ? detectFirstIndent(effectiveStrings)
    : detectCommonIndent(effectiveStrings);

  const processed = processStrings(effectiveStrings, indentCount, state.opts);

  if (anchored) entry.anchored = processed;
  else entry.normal = processed;

  return processed;
}

/**
 * Detect whether this is an "anchored" call. An anchored call uses the
 * indent symbol (or the tag itself, for outdent migration) as the first
 * interpolation, placed on its own line, to set a custom zero-indent
 * reference point.
 *
 * Five conditions must all hold:
 * 1. There is at least one interpolated value.
 * 2. The first value is the `indent` symbol or the tag function itself.
 * 3. Everything in strings[0] is whitespace and newlines (no content
 *    before the marker).
 * 4. strings[0] contains at least one newline.
 * 5. strings[1] starts with a newline or is empty (the marker is on
 *    its own line, not `text ${indent} more text`).
 */
function isAnchoredCall(tag: Undent | null, strings: TemplateStringsArray, values: ReadonlyArray<unknown>): boolean {
  if (!tag || values.length === 0) return false;

  const v0 = values[0];
  if (v0 !== indent && v0 !== tag) return false;

  const s0 = strings[0];
  let hasNl = false;
  for (let i = 0; i < s0.length; i++) {
    const c = s0.charCodeAt(i);
    if (c === 0x0a || c === 0x0d) { hasNl = true; continue; }
    if (c === 0x20 || c === 0x09) continue;
    return false; // non-whitespace content before marker
  }
  if (!hasNl) return false;

  if (strings.length < 2) return false;
  const s1 = strings[1];
  if (s1.length === 0) return true;
  const c0 = s1.charCodeAt(0);
  return c0 === 0x0a || c0 === 0x0d;
}

// --- Indent detection ----------------------------------------------------
//
// These functions scan template segments character-by-character to find
// the indentation level. A "content line" is whitespace after a newline
// that is followed by non-whitespace content (or, for non-last segments,
// followed by the end of the segment where an interpolation sits).
//
// The scanner works like a tiny state machine:
//   1. Scan for a newline character (\n, \r, or \r\n).
//   2. Count consecutive space/tab characters after it.
//   3. Check what follows: content? another newline (blank line)? or
//      end-of-segment (interpolation or template end)?
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

  for (let i = 0; i < segment.length; i++) {
    const nlLen = newlineLengthAt(segment, i);
    if (nlLen === 0) continue;

    // Found a newline. Count whitespace after it.
    let j = i + nlLen;
    let ind = 0;
    while (j < segment.length) {
      const wc = segment.charCodeAt(j);
      if (wc !== 0x20 && wc !== 0x09) break;
      ind++;
      j++;
    }

    if (j < segment.length) {
      // Something follows the whitespace. If it's content (not another
      // newline), this line's indent participates in the minimum.
      const nc = segment.charCodeAt(j);
      if (nc !== 0x0a && nc !== 0x0d) {
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
  for (let i = 0; i < segment.length; i++) {
    const nlLen = newlineLengthAt(segment, i);
    if (nlLen === 0) continue;

    let j = i + nlLen;
    let ind = 0;
    while (j < segment.length) {
      const wc = segment.charCodeAt(j);
      if (wc !== 0x20 && wc !== 0x09) break;
      ind++;
      j++;
    }

    if (j < segment.length) {
      const nc = segment.charCodeAt(j);
      if (nc !== 0x0a && nc !== 0x0d) return ind;
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
    if (c === 0x20 || c === 0x09) { count++; continue; }
    if (c === 0x0a || c === 0x0d) return count;
    return -1; // non-whitespace before any newline
  }
  return -1; // no newline found
}

// --- Segment processing --------------------------------------------------

const ANY_NEWLINE = /\r\n|\r|\n/g;
const NEWLINE_AND_LINE = /(\r\n|\r|\n)([^\r\n]*)/g;
const LEADING_ONE = /^[ \t]*(?:\r\n|\r|\n)/;
const TRAILING_ONE = /(?:\r\n|\r|\n)[ \t]*$/;
const LEADING_ALL = /^(?:[ \t]*(?:\r\n|\r|\n))+/;
const TRAILING_ALL = /(?:(?:\r\n|\r|\n)[ \t]*)+$/;

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
function processStrings(strings: ReadonlyArray<string>, indentCount: number, opts: ResolvedOptions): string[] {
  const strip = indentCount > 0
    ? new RegExp(`(\\r\\n|\\r|\\n)[ \\t]{0,${indentCount}}`, "g")
    : null;

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
    if (i === 0 && i === last
      && opts.trimLeading === "all" && opts.trimTrailing === "all"
      && s.length > 0 && s.trim().length === 0) {
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
// Unlike the template pipeline (which can rely on structural guarantees
// from template syntax), dedentString handles arbitrary input safely:
//
// 1. Split the input preserving newline sequences as separators.
// 2. Find the true minimum indent across ALL non-blank lines (including
//    the first line — templates skip it, strings don't).
// 3. Slice that many characters off the front of each line. Only
//    whitespace is ever removed because we measured whitespace.
// 4. Trim wrapper blank lines using the configured mode.
// 5. Rejoin with the ORIGINAL newline separators (preserving \n, \r\n,
//    \r exactly as they appeared).
// ==========================================================================

/**
 * Strip common leading indentation from an arbitrary string.
 *
 * This is the safe algorithm used by `.string()` and {@link embed}.
 * It scans every non-blank line for the true minimum indent and only
 * ever removes whitespace. Exported for direct use when you need
 * dedenting without the template tag machinery.
 *
 * Optimized two-pass approach: Pass 1 scans for minimum indent without
 * any array allocation. Pass 2 builds output parts directly and joins
 * once, avoiding the overhead of splitLines + modify + rejoinLines.
 *
 * @param input - The string to dedent.
 * @param trimLeading - How to trim leading blank lines (default: "all").
 * @param trimTrailing - How to trim trailing blank lines (default: "all").
 */
export function dedentString(
  input: string,
  trimLeading: TrimMode = "all",
  trimTrailing: TrimMode = "all",
): string {
  const len = input.length;
  if (len === 0) return "";

  // ── Pass 1: find minimum indent (zero allocation) ──────────────
  let minIndent = Infinity;
  let pos = 0;
  while (pos < len) {
    // Count leading whitespace at start of line
    let ws = 0;
    while (pos + ws < len) {
      const c = input.charCodeAt(pos + ws);
      if (c !== 0x20 && c !== 0x09) break;
      ws++;
    }
    // Check if this line has content (not blank, not just a newline)
    const afterWs = pos + ws;
    if (afterWs < len) {
      const c = input.charCodeAt(afterWs);
      if (c !== 0x0a && c !== 0x0d) {
        if (ws < minIndent) minIndent = ws;
      }
    }
    // Advance past rest of line + newline
    pos = afterWs;
    while (pos < len) {
      const c = input.charCodeAt(pos);
      if (c === 0x0a) { pos++; break; }
      if (c === 0x0d) { pos++; if (pos < len && input.charCodeAt(pos) === 0x0a) pos++; break; }
      pos++;
    }
    // If we didn't move past afterWs (last line, no newline), break
    if (pos === afterWs && afterWs >= len) break;
  }
  if (minIndent === Infinity) minIndent = 0;

  // ── Pass 2: build output parts ─────────────────────────────────
  // Interleave line content and separator strings, then join once.
  // This avoids creating separate lines/seps arrays and the rejoin loop.
  const parts: string[] = [];
  pos = 0;
  while (pos < len) {
    // Count leading whitespace
    let ws = 0;
    while (pos + ws < len) {
      const c = input.charCodeAt(pos + ws);
      if (c !== 0x20 && c !== 0x09) break;
      ws++;
    }
    const afterWs = pos + ws;

    // Find end of line (position of newline or end of string)
    let eol = afterWs;
    while (eol < len) {
      const c = input.charCodeAt(eol);
      if (c === 0x0a || c === 0x0d) break;
      eol++;
    }

    // Push line content: blank lines → "", content lines → stripped
    if (eol === afterWs) {
      parts.push("");
    } else {
      // Strip at most minIndent whitespace characters
      const stripCount = ws < minIndent ? ws : minIndent;
      parts.push(input.slice(pos + stripCount, eol));
    }

    // Push separator if there's a newline
    if (eol < len) {
      const c = input.charCodeAt(eol);
      if (c === 0x0d && eol + 1 < len && input.charCodeAt(eol + 1) === 0x0a) {
        parts.push("\r\n");
        pos = eol + 2;
      } else {
        parts.push(c === 0x0a ? "\n" : "\r");
        pos = eol + 1;
      }
    } else {
      break;
    }
  }

  // If the string ended with a newline, there's an implicit empty line
  // after it (same as splitLines produces lines.length = seps.length + 1).
  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (last === "\n" || last === "\r\n" || last === "\r") {
      parts.push("");
    }
  }

  // ── Trim leading/trailing blank lines ──────────────────────────
  // parts is interleaved: [line, sep, line, sep, ..., line]
  // Use index tracking instead of splice to avoid O(n²).
  let startIdx = 0;
  let endIdx = parts.length;

  if (trimLeading !== "none") {
    const limit = trimLeading === "one" ? 1 : Infinity;
    let trimmed = 0;
    // Each "line + sep" pair is 2 entries. A blank line has parts[startIdx] === "".
    while (trimmed < limit && startIdx + 1 < endIdx && parts[startIdx] === "") {
      startIdx += 2;
      trimmed++;
    }
  }

  if (trimTrailing !== "none") {
    const limit = trimTrailing === "one" ? 1 : Infinity;
    let trimmed = 0;
    // Last line is at endIdx-1. A blank trailing line has parts[endIdx-1] === "".
    while (trimmed < limit && endIdx - 2 >= startIdx && parts[endIdx - 1] === "") {
      endIdx -= 2;
      trimmed++;
    }
  }

  // Join the relevant slice
  if (startIdx === 0 && endIdx === parts.length) return parts.join("");
  let out = "";
  for (let i = startIdx; i < endIdx; i++) out += parts[i];
  return out;
}

// ==========================================================================
// Joining: plain vs alignment-aware
//
// joinPlain is a simple interleave of segments and stringified values.
//
// joinAligned computes a padding string for each value by measuring
// the "column offset" — how many characters since the last newline
// in the accumulated output. This padding is prepended to all lines
// after the first in multi-line values, keeping them visually aligned
// under their insertion point.
// ==========================================================================

/**
 * Join segments and values with alignment support.
 *
 * Values wrapped by {@link align} or {@link embed} always get aligned.
 * When `alignAll` is true, unwrapped multi-line values are aligned too.
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

    if (wrapped || (alignAll && text.includes("\n"))) {
      out += alignText(text, " ".repeat(columnOffset(out)));
    } else {
      out += text;
    }

    out += (strings[i] ?? "");
  }

  return out;
}

/**
 * Align subsequent lines by prefixing them with `pad`.
 *
 * - Keeps the first line unchanged.
 * - Preserves original newline sequences.
 * - Does NOT add padding to blank/whitespace-only lines (avoids trailing whitespace growth).
 *
 * Examples:
 * ```ts
 * alignText("a\nb\nc", "  ") === "a\n  b\n  c"
 * alignText("a\n\nc", "  ")  === "a\n\n  c"
 * alignText("a\r\nb\rc", "  ") === "a\r\n  b\r  c"
 * ```
 *
 * The first line is left as-is (it's already at the insertion point).
 * Blank/whitespace-only lines stay empty so we don't produce trailing
 * whitespace. Original newline sequences are preserved.
 *
 * Uses a regex replacement callback instead of splitLines/rejoinLines,
 * avoiding two array allocations and the rejoin step entirely.
 *
 * @param text - The multi-line string to align.
 * @param pad - A string of spaces to prepend to lines 2+.
 */
export function alignText(text: string, pad: string): string {
  if (pad.length === 0) return text;

  const len = text.length;
  if (len === 0) return text;
  
  if (pad.length === 0 || !text.includes("\n") && !text.includes("\r")) {
    return text;
  }

  // Match each newline followed by the rest of its line (up to the next
  // newline or end of string). The callback pads non-blank lines.
  return text.replace(
    NEWLINE_AND_LINE,
    (_match: string, nl: string, line: string) => {
      // Fast blank check: scan for non-whitespace
      for (let i = 0; i < line.length; i++) {
        const c = line.charCodeAt(i);
        if (c !== 0x20 && c !== 0x09) return nl + pad + line;
      }
      // Blank line → just the newline, no trailing whitespace
      return nl;
    },
  );
}

// ==========================================================================
// Shared primitives
//
// Small, focused functions used across both pipelines. Each operates
// at the character level for newline handling or provides a reusable
// split/join pattern.
// ==========================================================================

/**
 * Split a string into lines and their separators, preserving the exact
 * newline sequences (`\n`, `\r\n`, `\r`).
 *
 * Given `"hello\r\nworld\nfoo"`, returns:
 * - lines: `["hello", "world", "foo"]`
 * - seps:  `["\r\n", "\n"]`
 *
 * The arrays satisfy `lines.length === seps.length + 1`, and the
 * original string can be reconstructed with {@link rejoinLines}.
 *
 * Uses a character-level scanner instead of regex split for performance.
 * Pre-counts newlines to allocate arrays exactly, avoiding repeated
 * array resizing. On 1K-line inputs this is ~2x faster than
 * `text.split(/(\r\n|\r|\n)/)`.
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
 * Rejoin lines and separators produced by {@link splitLines}.
 *
 * Uses an interleaved array with a single `join("")` call, which is
 * faster than `+=` concatenation for large inputs because V8's join
 * pre-computes total length and copies once.
 */
export function rejoinLines(lines: ReadonlyArray<string>, seps: ReadonlyArray<string>): string {
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
 * This is the "column offset" — the position where the next character
 * would appear. Used by alignment to compute how many spaces to pad.
 *
 * Uses native `lastIndexOf` instead of a JS charcode loop for ~100x
 * speedup on long strings (V8 implements indexOf/lastIndexOf in C++).
 * 
 * Column offset = number of characters after the final newline sequence.
 *
 * Examples:
 * - "abc\n  "      => 2
 * - "abc\r\n    "  => 4
 * - "abc\r  "      => 2
 * - "abc\n"        => 0
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
 * Return the byte length of a newline sequence at position `i`, or 0.
 * Recognizes `\n` (1), `\r\n` (2), and `\r` (1).
 * - `\n` => 1
 * - `\r\n` => 2
 * - `\r` => 1
 * - otherwise => 0
 */
export function newlineLengthAt(text: string, i: number): 0 | 1 | 2 {
  const c = text.charCodeAt(i);
  if (c === 10) return 1; // \n
  if (c !== 13) return 0; // not \r
  // \r
  return i + 1 < text.length && text.charCodeAt(i + 1) === 10 ? 2 : 1;
}
