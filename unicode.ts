import type { ColumnOffsetFunction } from './mod.ts';
import {
	EAST_ASIAN_AMBIGUOUS_RANGES as INTERNAL_EAST_ASIAN_AMBIGUOUS_RANGES,
	EAST_ASIAN_WIDE_RANGES as INTERNAL_EAST_ASIAN_WIDE_RANGES,
} from './_unicode_constants.ts';

/**
 * # Unicode Alignment Helpers
 *
 * Use these helpers when plain JavaScript string length is not good enough for
 * alignment.
 *
 * In the main `undent` path, alignment is measured the simple JavaScript way:
 * count how much string data appears after the last newline. That is fast and
 * predictable, and it works well for plain ASCII-heavy text.
 *
 * Unicode text is messier. Some characters take two columns in a terminal,
 * some combine with the character before them, and some emoji are built from
 * several code points that display as one visible symbol. The helpers here aim
 * at that visual, terminal-style width instead.
 *
 * The measurement pipeline is:
 *
 * ```text
 * input string
 *   -> slice last line after the final newline
 *   -> segment into grapheme clusters when Intl.Segmenter exists
 *   -> let widthOf(...) override specific graphemes
 *   -> otherwise apply built-in width rules
 *   -> sum visual columns
 * ```
 *
 * The built-in width rules intentionally stay conservative:
 *
 * - tabs are configurable because their width depends on the current column,
 * - control characters and combining-only fragments contribute zero columns,
 * - emoji-style pictographs and regional-indicator flags count as two columns,
 * - East Asian wide/fullwidth ranges count as two columns,
 * - ambiguous-width ranges can be narrow or wide by option,
 * - everything else counts as one column.
 *
 * The result is still only an estimate. Browsers, fonts, and terminals do not
 * all draw text the same way. These helpers are an opt-in best guess for common
 * monospace terminal output.
 *
 * @module
 */

/**
 * The current visual column before measuring the next grapheme cluster.
 *
 * A width function gets this value so it can answer questions like: "if I am
 * currently at column 6, how wide should a tab be right now?"
 */
export interface UnicodeColumnWidthState {
  /** The current visual column before the grapheme is measured. */
  readonly column: number;
}

/**
 * Measure the visual width of one grapheme cluster.
 *
 * A grapheme cluster is the closest thing to one visible character. Sometimes
 * that really is one code point. Sometimes it is a base letter plus a
 * combining mark, or a multi-code-point emoji sequence.
 *
 * Return `undefined` to let the built-in rules decide the width. Any defined
 * return value must be a non-negative integer.
 */
export type UnicodeWidthFunction = (
  grapheme: string,
  state: UnicodeColumnWidthState,
) => number | undefined;

/**
 * Options for the Unicode-aware column measurement helpers.
 *
 * These helpers are meant for terminal-style monospace alignment. They are
 * opt-in because visual width depends on where the text is shown.
 */
export interface UnicodeColumnOffsetOptions {
  /**
   * How tabs advance.
   *
   * Set to `false` to treat `"\t"` as one column. Set to a positive integer to
   * align tabs to tab stops.
   *
   * @default false
   */
  tabWidth?: number | false;

  /**
   * How to treat East Asian Width "ambiguous" code points.
   *
   * Unicode recommends treating them as narrow when the rendering context is
   * not known.
   *
   * @default "narrow"
   */
  ambiguous?: 'narrow' | 'wide';

  /**
   * Override the width of specific grapheme clusters.
   *
   * Use this when you know more about your display target than the built-in
   * rules do. Return `undefined` to fall back to the default behavior.
   */
  widthOf?: UnicodeWidthFunction;
}

/** Inclusive `[start, end]` code-point range used by the lookup tables. */
export type CodePointRange = readonly [start: number, end: number];

/**
 * Default option values for the Unicode-aware column helpers.
 *
 * The defaults intentionally choose the conservative terminal policy: tabs are
 * treated as a single column unless callers opt into tab stops, and ambiguous
 * East Asian Width code points stay narrow unless the rendering context says
 * otherwise.
 */
export const DEFAULT_UNICODE_COLUMN_OFFSET_OPTIONS: Required<
  Pick<UnicodeColumnOffsetOptions, 'tabWidth' | 'ambiguous'>
> = {
  tabWidth: false,
  ambiguous: 'narrow',
};

/**
 * East Asian wide/fullwidth ranges from Unicode's `EastAsianWidth.txt`.
 *
 * The runtime stays dependency-free by keeping the verified ranges inline, but
 * the generated table now lives in `./_unicode_constants.ts` so maintenance
 * tooling can refresh it without rewriting this public module.
 */
export const EAST_ASIAN_WIDE_RANGES: ReadonlyArray<CodePointRange> =
	INTERNAL_EAST_ASIAN_WIDE_RANGES;

/**
 * East Asian ambiguous-width ranges from Unicode's `EastAsianWidth.txt`.
 *
 * These are the upstream `A` property ranges compressed into inclusive
 * `[start, end]` pairs. Callers still choose how to interpret them through the
 * `ambiguous` option, while the generated data lives in
 * `./_unicode_constants.ts`.
 */
export const EAST_ASIAN_AMBIGUOUS_RANGES: ReadonlyArray<CodePointRange> =
	INTERNAL_EAST_ASIAN_AMBIGUOUS_RANGES;

/**
 * Detect graphemes that contain emoji-style pictographs.
 *
 * The default width rules treat these graphemes as occupying two columns,
 * matching the common terminal convention for emoji presentation.
 */
export const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;

/** Minimal shape of an `Intl.Segmenter#segment()` item. */
export interface GraphemeSegment {
  /** The grapheme cluster text for one segmentation result. */
  readonly segment: string;
}

/** Minimal grapheme-segmentation interface used by the Unicode helpers. */
export interface GraphemeSegmenter {
  /** Segment the input string into grapheme-cluster records. */
  segment(input: string): Iterable<GraphemeSegment>;
}

/**
 * Structural type for runtimes that expose `Intl.Segmenter`.
 *
 * We only need one small part of `Intl`: the `Segmenter` constructor. This
 * local type lets the module describe just that part, which keeps things
 * working even in environments whose bundled types do not expose
 * `Intl.Segmenter` directly.
 */
export type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity: 'grapheme' },
  ) => GraphemeSegmenter;
};

/**
 * Fully resolved Unicode column-measurement options.
 *
 * The resolver fills in default `tabWidth` and `ambiguous` values while still
 * carrying through caller-provided overrides such as `widthOf`.
 */
export type ResolvedUnicodeColumnOffsetOptions =
  & Required<Pick<UnicodeColumnOffsetOptions, 'tabWidth' | 'ambiguous'>>
  & UnicodeColumnOffsetOptions;

/** Shared typed reference to the global `Intl` object. */
const intlWithSegmenter = Intl as IntlWithSegmenter;

/** Lazily initialized grapheme segmenter cache. */
let graphemeSegmenter: GraphemeSegmenter | null | undefined;

/**
 * Create a `columnOffset` function that measures terminal-style Unicode width.
 *
 * Use this with `undent.with({ columnOffset })` when later lines of aligned
 * values should line up the way a terminal is likely to draw them, rather than
 * by raw JavaScript string length.
 *
 * @example Aligning with terminal-style Unicode columns
 * ```ts
 * import { undent } from '@okikio/undent';
 * import { createUnicodeColumnOffset } from '@okikio/undent/unicode';
 *
 * const terminalUndent = undent.with({
 *   alignValues: true,
 *   columnOffset: createUnicodeColumnOffset(),
 * });
 *
 * terminalUndent`
 *   label: 界 ${'a\nb'}
 * `;
 * // "label: 界 a\n          b"
 * ```
 *
 * @example Configuring tabs and ambiguous-width handling
 * ```ts
 * import { createUnicodeColumnOffset } from '@okikio/undent/unicode';
 *
 * const columnOffset = createUnicodeColumnOffset({
 *   tabWidth: 4,
 *   ambiguous: 'wide',
 * });
 * ```
 */
export function createUnicodeColumnOffset(
  options: UnicodeColumnOffsetOptions = {},
): ColumnOffsetFunction {
  const resolved = resolveUnicodeColumnOffsetOptions(options);

  return function unicodeColumnOffsetWithOptions(text: string): number {
    return unicodeColumnOffset(text, resolved);
  };
}

/**
 * Measure the visual insertion column after the final newline in `text`.
 *
 * `columnOffset()` from the root module counts raw JavaScript string units.
 * `unicodeColumnOffset()` measures the last line in terminal-style display
 * columns instead, because alignment only cares about the insertion point
 * after the final newline.
 *
 * @example Measuring the last line of a string with wide characters
 * ```ts
 * import { unicodeColumnOffset } from '@okikio/undent/unicode';
 *
 * unicodeColumnOffset('x\n界 '); // 3
 * ```
 */
export function unicodeColumnOffset(
  text: string,
  options: UnicodeColumnOffsetOptions = {},
): number {
  return visualColumnWidth(
    sliceAfterLastNewline(text),
    resolveUnicodeColumnOffsetOptions(options),
  );
}

/**
 * Measure the terminal-style visual width of a single line.
 *
 * Measurement follows what a reader is likely to see, not just how many
 * JavaScript string units are present. The loop walks grapheme clusters so things
 * like combining accents and multi-part emoji stay together before width rules
 * are applied.
 *
 * It is still only a best-effort estimate. Different renderers can draw the
 * same text at different widths.
 *
 * @example Measuring combining marks as one visible cell
 * ```ts
 * import { visualColumnWidth } from '@okikio/undent/unicode';
 *
 * visualColumnWidth('e\u0301 '); // 2
 * ```
 */
export function visualColumnWidth(
  text: string,
  options: UnicodeColumnOffsetOptions = {},
): number {
  const resolved = resolveUnicodeColumnOffsetOptions(options);
  let column = 0;

  for (const grapheme of graphemes(text)) {
    const customWidth = resolved.widthOf?.(grapheme, { column });
    if (customWidth !== undefined) {
      column += validateWidth(customWidth, 'widthOf(...)');
      continue;
    }

    column += defaultGraphemeWidth(grapheme, column, resolved);
  }

  return column;
}

/**
 * Normalize caller options once so the measurement loop can stay simple.
 *
 * Validation happens here so repeated measurements can focus on width work
 * instead of re-checking the same options over and over.
 */
export function resolveUnicodeColumnOffsetOptions(
  options: UnicodeColumnOffsetOptions,
): ResolvedUnicodeColumnOffsetOptions {
  if (options.tabWidth !== undefined && options.tabWidth !== false) {
    validateTabWidth(options.tabWidth);
  }

  return Object.assign({}, DEFAULT_UNICODE_COLUMN_OFFSET_OPTIONS, options);
}

/**
 * Return the last logical line of a string.
 *
 * Alignment cares only about the insertion column after the final newline, so
 * this trims away earlier lines before visual-width measurement begins.
 */
export function sliceAfterLastNewline(text: string): string {
  const lastLF = text.lastIndexOf('\n');
  const lastCR = text.lastIndexOf('\r');
  const lastNL = lastLF > lastCR ? lastLF : lastCR;

  return lastNL === -1 ? text : text.slice(lastNL + 1);
}

/**
 * Measure one grapheme cluster with the built-in width rules.
 *
 * Read the built-in rules as a small checklist. Each question runs in order,
 * and the first matching rule decides the width:
 *
 * ```text
 * grapheme
 *   -> tab?                => tab-stop width
 *   -> control only?       => 0
 *   -> emoji pictograph?   => 2
 *   -> regional indicator? => 2
 *   -> inspect code points
 *        -> skip zero-width modifiers and joiners
 *        -> wide/fullwidth => 2
 *        -> ambiguous+wide => 2
 *        -> otherwise mark a visible base code point
 *   -> visible base found? => 1
 *   -> otherwise           => 0
 * ```
 *
 * That order prevents helper code points, such as combining marks or joiners,
 * from adding width on top of the visible character they belong to.
 */
export function defaultGraphemeWidth(
  grapheme: string,
  column: number,
  options: ResolvedUnicodeColumnOffsetOptions,
): number {
  if (grapheme.length === 0) return 0;

  if (grapheme === '\t') {
    if (options.tabWidth === false) return 1;

    const remainder = column % options.tabWidth;
    return remainder === 0 ? options.tabWidth : options.tabWidth - remainder;
  }

  if (isControlOnly(grapheme)) return 0;
  if (EXTENDED_PICTOGRAPHIC_RE.test(grapheme)) return 2;

  let sawBaseCodePoint = false;

  for (const char of grapheme) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (isControlCodePoint(codePoint) || isZeroWidthCodePoint(codePoint)) {
      continue;
    }

    sawBaseCodePoint = true;

		if (isRegionalIndicatorCodePoint(codePoint)) {
			return 2;
		}

    if (isWideCodePoint(codePoint)) {
      return 2;
    }

    if (
      options.ambiguous === 'wide' &&
      isAmbiguousWidthCodePoint(codePoint)
    ) {
      return 2;
    }
  }

  return sawBaseCodePoint ? 1 : 0;
}

/**
 * Iterate text as grapheme clusters when the runtime supports it.
 *
 * If the runtime has `Intl.Segmenter`, we use it because it understands where
 * one visible character ends and the next begins. If not, we fall back to
 * `for...of`, which is still better than raw UTF-16 indexing but cannot keep
 * every multi-part emoji sequence together.
 */
export function* graphemes(text: string): Iterable<string> {
  const segmenter = getGraphemeSegmenter();

  if (segmenter !== null) {
    for (const segment of segmenter.segment(text)) {
      yield segment.segment;
    }

    return;
  }

  yield* text;
}

/**
 * Lazily create and memoize the grapheme segmenter.
 *
 * Importing the module should stay cheap, so we do not build the segmenter up
 * front. We create it the first time someone needs it, then keep reusing that
 * same instance.
 */
export function getGraphemeSegmenter(): GraphemeSegmenter | null {
  if (graphemeSegmenter !== undefined) {
    return graphemeSegmenter;
  }

  graphemeSegmenter = typeof intlWithSegmenter.Segmenter === 'function'
    ? new intlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

  return graphemeSegmenter;
}

/**
 * Validate widths returned by `widthOf(...)`.
 *
 * Custom width hooks are allowed to override the built-in rules, so bad return
 * values should fail loudly instead of being silently coerced into something
 * surprising.
 */
export function validateWidth(width: number, source: string): number {
  if (!Number.isInteger(width) || width < 0) {
    throw new TypeError(
      `undent/unicode: ${source} must return a non-negative integer`,
    );
  }

  return width;
}

/**
 * Validate tab-stop configuration once during option resolution.
 */
export function validateTabWidth(tabWidth: number): void {
  if (!Number.isInteger(tabWidth) || tabWidth < 1) {
    throw new TypeError(
      'undent/unicode: "tabWidth" must be a positive integer or false',
    );
  }
}

/**
 * Return true when every code point in the grapheme is a control character.
 *
 * We only treat the whole grapheme as zero-width when nothing visible is in
 * it. If a visible character is present, the wider grapheme-width logic keeps
 * handling it.
 */
export function isControlOnly(grapheme: string): boolean {
  for (const char of grapheme) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (!isControlCodePoint(codePoint)) return false;
  }

  return true;
}

/**
 * Return true when the code point is a regional indicator symbol.
 *
 * These code points form Unicode flag graphemes in pairs. Terminals commonly
 * render both the pair and the standalone symbol as emoji-width cells, so the
 * built-in width rules treat them as occupying two columns.
 */
function isRegionalIndicatorCodePoint(codePoint: number): boolean {
	return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

/**
 * Control characters never consume terminal columns by themselves.
 */
export function isControlCodePoint(codePoint: number): boolean {
  return codePoint === 0x00 ||
    (codePoint >= 0x01 && codePoint <= 0x1f) ||
    (codePoint >= 0x7f && codePoint <= 0x9f);
}

/**
 * Zero-width code points modify neighboring characters instead of occupying
 * their own cell.
 *
 * This includes combining marks, variation selectors, and the zero-width
 * joiner used to glue emoji into a single presented grapheme.
 */
export function isZeroWidthCodePoint(codePoint: number): boolean {
  return (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
}

/**
 * Check East Asian wide/fullwidth ranges with a binary search.
 *
 * The data is stored as sorted ranges instead of a huge hand-written list of
 * comparisons. Binary search gives us a fast lookup without making the table
 * hard to audit.
 */
export function isWideCodePoint(codePoint: number): boolean {
  return isCodePointInRanges(codePoint, EAST_ASIAN_WIDE_RANGES);
}

/**
 * Check East Asian ambiguous-width ranges with the same binary-search helper.
 */
export function isAmbiguousWidthCodePoint(codePoint: number): boolean {
  return isCodePointInRanges(codePoint, EAST_ASIAN_AMBIGUOUS_RANGES);
}

/**
 * Return true when `codePoint` falls inside any `[start, end]` range.
 *
 * The ranges are sorted, so we can repeatedly cut the search space in half
 * instead of checking every entry one by one.
 */
export function isCodePointInRanges(
  codePoint: number,
  ranges: ReadonlyArray<CodePointRange>,
): boolean {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end] = ranges[middle]!;

    if (codePoint < start) {
      high = middle - 1;
      continue;
    }

    if (codePoint > end) {
      low = middle + 1;
      continue;
    }

    return true;
  }

  return false;
}