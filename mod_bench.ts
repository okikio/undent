/**
 * @module bench
 *
 * Benchmarks for undent using mitata.
 *
 * Run:
 *   deno bench --allow-env mod_bench.ts
 *   bun run mod_bench.ts
 *   node mod_bench.ts
 *
 * Optional (better memory-pressure signal):
 *   deno bench --allow-env --v8-flags=--expose-gc mod_bench.ts
 *   node --expose-gc mod_bench.ts
 *
 * Sections:
 *   1.  Competitor comparison — undent vs dedent vs outdent (apples-to-apples)
 *   2.  Core tag — scaling with interpolation count
 *   3.  String algorithm — .string() scaling with line count
 *   4.  Alignment — align(), embed(), alignValues
 *   5.  Configuration — .with() and createUndent() cost
 *   6.  Cache — hot path vs cold path
 *   7.  Composition — nested undent, anchor patterns
 *   8.  Primitives — exported utilities in isolation
 *   9.  Pathological — worst-case inputs
 *  10.  Real-world scenarios — common usage patterns
 *  11.  Curiosity — string-building microbenchmarks
 *
 * Memory regression tests live in mod_memory_test.ts and run as part
 * of `deno task test`.
 */
// deno-lint-ignore-file no-import-prefix no-unversioned-import

import {
  barplot,
  bench,
  boxplot,
  do_not_optimize,
  lineplot,
  run,
  summary,
} from "npm:mitata";

import undent, {
  align,
  alignText,
  columnOffset,
  createUndent,
  dedentString,
  embed,
  rejoinLines,
  splitLines,
} from "./mod.ts";
import {
  createUnicodeColumnOffset,
  unicodeColumnOffset,
  visualColumnWidth,
} from "./unicode.ts";

// Competitors
import npmDedent from "npm:dedent";
import { outdent as npmOutdent } from "npm:outdent";

// dedent has built-in multiline interpolation alignment via `alignValues`.
// Reuse a preconfigured instance to avoid counting withOptions() creation
// in per-iteration benchmark timings.
const npmDedentAlign = npmDedent.withOptions({ alignValues: true });

// =========================================================================
// Data generators
// =========================================================================

function makeLines(count: number, indent = "    "): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`${indent}line ${i}`);
  return out.join("\n");
}

function makeLineScaleData(
  min: number,
  max: number,
  indent = '    ',
): Record<number, string> {
  const out = Object.create(null) as Record<number, string>;
  for (let size = min; size <= max; size *= 2) {
    out[size] = makeLines(size, indent);
  }

  return out;
}

function makeTSA(segmentCount: number, indent = "    "): TemplateStringsArray {
  const strings: string[] = [];
  for (let i = 0; i < segmentCount; i++) {
    strings.push(i === 0 ? `\n${indent}` : `\n${indent}`);
  }
  strings.push(`\n  `);
  return Object.assign([...strings], {
    raw: [...strings],
  }) as unknown as TemplateStringsArray;
}

/**
 * Repeat a string with manual concatenation.
 *
 * This exists only for a curiosity benchmark comparing loop-based string
 * building with the built-in `.repeat()` primitive.
 */
function repeatWithLoop(text: string, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    out += text;
  }
  return out;
}

/**
 * Repeat a string with `Array(...).fill(...).join("")`.
 *
 * This is another common hand-written alternative to `.repeat()`, so the
 * curiosity benchmark measures it alongside the manual loop.
 */
function repeatWithFillJoin(text: string, count: number): string {
  return new Array<string>(count).fill(text).join('');
}

/**
 * Competitor-equivalent helper for multiline interpolation alignment.
 *
 * outdent does not expose `align(...)`, so this simulates equivalent
 * user-level behavior: keep first line as-is, pad non-blank subsequent
 * lines with `pad`.
 */
function alignLike(value: string, pad: string): string {
  return value.replace(
    /(\r\n|\r|\n)([^\r\n]*)/g,
    (_m: string, nl: string, line: string) =>
      line.trim().length === 0 ? nl : `${nl}${pad}${line}`,
  );
}

/**
 * Competitor-equivalent helper for outdent `embed(...)` behavior:
 * 1) dedent the snippet itself (`outdent.string(...)`),
 * 2) then align it at interpolation column.
 */
function embedLike(
  value: string,
  dedentFn: (input: string) => string,
  pad: string,
): string {
  return alignLike(dedentFn(value), pad);
}

// Pre-built data — allocated once, reused across iterations.
const SMALL_10 = makeLines(10);
const CLEAN_10 = makeLines(10, '');
const CLEAN_100 = makeLines(100, '');
const CLEAN_1K = makeLines(1_000, '');
const CLEAN_50K = makeLines(50_000, '');
const MED_100 = makeLines(100);
const LARGE_1K = makeLines(1_000);
const LARGE_5K = makeLines(5_000);
const LARGE_10K = makeLines(10_000);
const LARGE_50K = makeLines(50_000);

const STRING_SCALE_MIN = 8;
const STRING_SCALE_MAX = 16_384;
const STRING_SCALE_INDENTED = makeLineScaleData(STRING_SCALE_MIN, STRING_SCALE_MAX);
const STRING_SCALE_CLEAN = makeLineScaleData(STRING_SCALE_MIN, STRING_SCALE_MAX, '');

const INDENTED_100 = makeLines(100, "        ");
const INDENTED_1K = makeLines(1_000, "        ");
const INDENTED_50K = makeLines(50_000, "        ");

const SHORT_PLAIN = 'hello world';
const SHORT_INDENTED = '    hello world';
const PLAIN_LONG_LINE = 'x'.repeat(100_000);

const ML_50 = Array.from({ length: 50 }, (_, i) => `item ${i}`).join("\n");
const ML_500 = Array.from({ length: 500 }, (_, i) => `item ${i}`).join("\n");
const ML_5K = Array.from({ length: 5_000 }, (_, i) => `item ${i}`).join("\n");
const ML_500_MOSTLY_BLANK = Array.from(
  { length: 500 },
  (_, i) => i % 8 === 0 ? `item ${i}` : "",
).join("\n");

const UNICODE_CJK_500 = Array.from(
  { length: 500 },
  (_, i) => `項目${i} 界界`,
).join("\n");
const UNICODE_EMOJI_500 = Array.from(
  { length: 500 },
  (_, i) => `😀 item ${i}`,
).join("\n");
const UNICODE_COMBINING_500 = Array.from(
  { length: 500 },
  (_, i) => `e\u0301 item ${i}`,
).join("\n");
const UNICODE_TAB_HEAVY_500 = Array.from(
  { length: 500 },
  (_, i) => `\t列\t${i}`,
).join("\n");
const UNICODE_MIXED_COLUMN_LINE = 'prefix 界😀e\u0301\tΩ';

// Preconfigure the Unicode-aware measurers once so the benchmark loop only
// measures the alignment work, not repeated option normalization.
const unicodeColumnOffsetDefault = createUnicodeColumnOffset();
const unicodeColumnOffsetTabs = createUnicodeColumnOffset({
  tabWidth: 4,
  ambiguous: 'wide',
});
const undentAlignUnicode = undent.with({
  alignValues: true,
  columnOffset: unicodeColumnOffsetDefault,
});
const undentAlignUnicodeTabs = undent.with({
  alignValues: true,
  columnOffset: unicodeColumnOffsetTabs,
});

const DEEP_INDENT_100 = makeLines(100, " ".repeat(200));
const ALL_BLANK_1K = Array.from({ length: 1000 }, () => "   ").join("\n");
const MIXED_INDENT_500 = Array.from(
  { length: 500 },
  (_, i) => " ".repeat(i % 20) + `line ${i}`,
).join("\n");
const LONG_LINE = "    " + "x".repeat(100_000);
const MIXED_NEWLINES_1K = makeLines(500, "    ").replace(/\n/g, (_, i: number) =>
  i % 3 === 0 ? "\r\n" : i % 3 === 1 ? "\r" : "\n") +
  "\r\n" + makeLines(500, "    ");
const TRIM_SAMPLE_STRING = "\n\n    alpha\n      beta\n\n";

function makeInlineTSA(prefix: string): TemplateStringsArray {
  return Object.assign([prefix, ""], {
    raw: [prefix, ""],
  }) as unknown as TemplateStringsArray;
}

// =========================================================================
// 1. Competitor comparison — undent vs dedent vs outdent
//
// Apples-to-apples: all three libraries performing their core operation
// (dedenting a tagged template literal with interpolation).
// =========================================================================

summary(() => {
  bench("undent: simple (2 lines, 1 interp)", () => {
    const x = "world";
    do_not_optimize(undent`
      Hello ${x}
      Goodbye ${x}
    `);
  });

  bench("dedent: simple (2 lines, 1 interp)", () => {
    const x = "world";
    do_not_optimize(npmDedent`
      Hello ${x}
      Goodbye ${x}
    `);
  });

  bench("outdent: simple (2 lines, 1 interp)", () => {
    const x = "world";
    do_not_optimize(npmOutdent`
      Hello ${x}
      Goodbye ${x}
    `);
  });
});

summary(() => {
  bench("undent: medium (8 lines, 5 interps)", () => {
    const a = "alpha", b = "beta", c = "gamma", d = "delta", e = "epsilon";
    do_not_optimize(undent`
      first: ${a}
      second: ${b}
      third: ${c}
        nested: ${d}
        nested: ${e}
      back to normal
      another line
      final
    `);
  });

  bench("dedent: medium (8 lines, 5 interps)", () => {
    const a = "alpha", b = "beta", c = "gamma", d = "delta", e = "epsilon";
    do_not_optimize(npmDedent`
      first: ${a}
      second: ${b}
      third: ${c}
        nested: ${d}
        nested: ${e}
      back to normal
      another line
      final
    `);
  });

  bench("outdent: medium (8 lines, 5 interps)", () => {
    const a = "alpha", b = "beta", c = "gamma", d = "delta", e = "epsilon";
    do_not_optimize(npmOutdent`
      first: ${a}
      second: ${b}
      third: ${c}
        nested: ${d}
        nested: ${e}
      back to normal
      another line
      final
    `);
  });
});

// .string() comparison — undent.string vs dedent(string) vs outdent.string
summary(() => {
  bench("undent.string: 100 lines", () => {
    do_not_optimize(undent.string(MED_100));
  });

  bench("dedent(string): 100 lines", () => {
    do_not_optimize(npmDedent(MED_100));
  });

  bench("outdent.string: 100 lines", () => {
    do_not_optimize(npmOutdent.string(MED_100));
  });
});

// =========================================================================
// 2. Core tag — scaling with interpolation count
// =========================================================================

barplot(() => {
  bench("tag: 0 interpolations", () => {
    do_not_optimize(undent`
      Hello
      World
    `);
  });

  bench("tag: 1 interpolation", () => {
    do_not_optimize(undent`
      Hello ${"World"}
    `);
  });

  bench("tag: 5 interpolations", () => {
    do_not_optimize(undent`
      ${"a"} ${"b"} ${"c"}
      ${"d"} ${"e"}
    `);
  });
});

// Parameterized with computed parameters to prevent LICM.
// deno-lint-ignore no-explicit-any
bench('tag: $n interpolations (computed)', function* (state: any) {
  const n = state.get("n");
  const tsa = makeTSA(n);
  const vals = Array.from({ length: n }, (_, i) => String(i));
  yield {
    [0]() {
      return vals.map((_, i) => String(i + Math.random()));
    },
    bench(freshVals: string[]) {
      do_not_optimize(undent(tsa, ...freshVals));
    },
  };
  }).range('n', 8, 128);

// =========================================================================
// 3. String algorithm — .string() scaling
// =========================================================================

// Hot-path string usage often looks much closer to an identity operation than
// to a large formatting transform: a short single-line value arrives, callers
// run `.string()` defensively, and the result should be as close as possible to
// the cost of handing the original string through untouched.
summary(() => {
  bench('plain string baseline: short single-line', () => {
    do_not_optimize(SHORT_PLAIN);
  });

  bench('undent.string hot path: short single-line', () => {
    do_not_optimize(undent.string(SHORT_PLAIN));
  });

  bench('undent.string hot path: short indented single-line', () => {
    do_not_optimize(undent.string(SHORT_INDENTED));
  });

  bench('dedent(string) hot path: short single-line', () => {
    do_not_optimize(npmDedent(SHORT_PLAIN));
  });

  bench('outdent.string hot path: short single-line', () => {
    do_not_optimize(npmOutdent.string(SHORT_PLAIN));
  });
});

summary(() => {
  bench('plain string baseline: short single-line ×1000', () => {
    let last = '';
    for (let i = 0; i < 1000; i++) {
      last = SHORT_PLAIN;
    }
    do_not_optimize(last);
  });

  bench('undent.string hot path: short single-line ×1000', () => {
    let last = '';
    for (let i = 0; i < 1000; i++) {
      last = undent.string(SHORT_PLAIN);
    }
    do_not_optimize(last);
  });

  bench('dedent(string) hot path: short single-line ×1000', () => {
    let last = '';
    for (let i = 0; i < 1000; i++) {
      last = npmDedent(SHORT_PLAIN);
    }
    do_not_optimize(last);
  });

  bench('outdent.string hot path: short single-line ×1000', () => {
    let last = '';
    for (let i = 0; i < 1000; i++) {
      last = npmOutdent.string(SHORT_PLAIN);
    }
    do_not_optimize(last);
  });
});

lineplot(() => {
  // deno-lint-ignore no-explicit-any
  bench('string: indented $lines lines', function* (state: any) {
    const lines = state.get('lines');
    const input = STRING_SCALE_INDENTED[lines]!;

    yield {
      [0]() {
        return input;
      },

      bench(input: string) {
        do_not_optimize(undent.string(input));
      },
    };
  }).range('lines', STRING_SCALE_MIN, STRING_SCALE_MAX);

  // Measure the multiline identity path separately so we can see whether the
  // early-return fast path stays flat as inputs scale.
  bench('string: clean pass-through $lines lines', function* (state: any) {
    const lines = state.get('lines');
    const input = STRING_SCALE_CLEAN[lines]!;

    yield {
      [0]() {
        return input;
      },

      bench(input: string) {
        do_not_optimize(undent.string(input));
      },
    };
  }).range('lines', STRING_SCALE_MIN, STRING_SCALE_MAX);
});

summary(() => {
  bench('plain string baseline: multiline 1K already clean', () => {
    do_not_optimize(CLEAN_1K);
  });

  bench('undent.string pass-through: multiline 1K already clean', () => {
    do_not_optimize(undent.string(CLEAN_1K));
  });

  bench('dedent(string) pass-through: multiline 1K already clean', () => {
    do_not_optimize(npmDedent(CLEAN_1K));
  });

  bench('outdent.string pass-through: multiline 1K already clean', () => {
    do_not_optimize(npmOutdent.string(CLEAN_1K));
  });
});

summary(() => {
  bench('plain string baseline: multiline 1K already clean ×100', () => {
    let last = '';
    for (let i = 0; i < 100; i++) {
      last = CLEAN_1K;
    }
    do_not_optimize(last);
  });

  bench('undent.string pass-through: multiline 1K already clean ×100', () => {
    let last = '';
    for (let i = 0; i < 100; i++) {
      last = undent.string(CLEAN_1K);
    }
    do_not_optimize(last);
  });
});

bench("string: mixed newlines 1K", () => {
  do_not_optimize(undent.string(MIXED_NEWLINES_1K));
});

// Large single-line strings are a practical hot path in code generation,
// logging, serialization, and HTTP response assembly. These benchmarks show
// how much overhead `.string()` adds above simply holding the original string.
summary(() => {
  bench('plain string baseline: 100K-char line', () => {
    do_not_optimize(PLAIN_LONG_LINE);
  }).gc('inner');

  bench('undent.string large: 100K-char line plain', () => {
    do_not_optimize(undent.string(PLAIN_LONG_LINE));
  }).gc('inner');

  bench('undent.string large: 100K-char line indented', () => {
    do_not_optimize(undent.string(LONG_LINE));
  }).gc('inner');

  bench('dedent(string) large: 100K-char line plain', () => {
    do_not_optimize(npmDedent(PLAIN_LONG_LINE));
  }).gc('inner');

  bench('outdent.string large: 100K-char line plain', () => {
    do_not_optimize(npmOutdent.string(PLAIN_LONG_LINE));
  }).gc('inner');
});

// Very large multi-line inputs matter for generated source files, embedded SQL,
// and templated config blobs. These keep the side-by-side library comparison so
// large-input regressions stay visible.
summary(() => {
  bench('undent.string huge: 50K lines already clean', () => {
    do_not_optimize(undent.string(CLEAN_50K));
  }).gc('inner');

  bench('dedent(string) huge: 50K lines already clean', () => {
    do_not_optimize(npmDedent(CLEAN_50K));
  }).gc('inner');

  bench('outdent.string huge: 50K lines already clean', () => {
    do_not_optimize(npmOutdent.string(CLEAN_50K));
  }).gc('inner');

  bench('undent.string huge: 50K lines indented', () => {
    do_not_optimize(undent.string(INDENTED_50K));
  }).gc('inner');

  bench('dedent(string) huge: 50K lines indented', () => {
    do_not_optimize(npmDedent(INDENTED_50K));
  }).gc('inner');

  bench('outdent.string huge: 50K lines indented', () => {
    do_not_optimize(npmOutdent.string(INDENTED_50K));
  }).gc('inner');
});

// =========================================================================
// 4. Alignment
// =========================================================================

boxplot(() => {
  bench("align: 50-line value", () => {
    do_not_optimize(undent`
      header:
        ${align(ML_50)}
    `);
  });

  bench("align: 500-line value", () => {
    do_not_optimize(undent`
      header:
        ${align(ML_500)}
    `);
  });

  bench("align: 5K-line value", () => {
    do_not_optimize(undent`
      header:
        ${align(ML_5K)}
    `);
  }).gc("inner");
});

// Competitor comparison for alignment behavior.
// dedent includes built-in alignValues; outdent does not include align(...),
// so outdent uses an equivalent userland alignment helper.
summary(() => {
  bench("undent align: 500-line value", () => {
    do_not_optimize(undent`
      header:
        ${align(ML_500)}
    `);
  });

  bench("dedent alignValues: 500-line value", () => {
    do_not_optimize(npmDedentAlign`
      header:
        ${ML_500}
    `);
  });

  bench("outdent align-like: 500-line value", () => {
    const v = alignLike(ML_500, "        ");
    do_not_optimize(npmOutdent`
      header:
        ${v}
    `);
  });
});

summary(() => {
  bench("embed: 100-line pre-indented", () => {
    do_not_optimize(undent`
      code:
        ${embed(INDENTED_100)}
    `);
  });

  bench("embed: 1K-line pre-indented", () => {
    do_not_optimize(undent`
      code:
        ${embed(INDENTED_1K)}
    `);
  }).gc("inner");
});

// Competitor comparison for embed behavior.
// Neither dedent nor outdent expose a direct embed(...) helper.
// dedent uses built-in alignValues + dedent(value).
// outdent uses equivalent userland: outdent.string(value) + alignLike(...).
summary(() => {
  bench("undent embed: 1K-line pre-indented", () => {
    do_not_optimize(undent`
      code:
        ${embed(INDENTED_1K)}
    `);
  }).gc("inner");

  bench("dedent embed-like (alignValues): 1K-line pre-indented", () => {
    const v = npmDedent(INDENTED_1K);
    do_not_optimize(npmDedentAlign`
      code:
        ${v}
    `);
  }).gc("inner");

  bench("outdent embed-like: 1K-line pre-indented", () => {
    const v = embedLike(INDENTED_1K, npmOutdent.string, "        ");
    do_not_optimize(npmOutdent`
      code:
        ${v}
    `);
  }).gc("inner");
});

bench("alignValues: 3 multi-line values", () => {
  const ua = undent.with({ alignValues: true });
  do_not_optimize(ua`
    first: ${"x\ny\nz"}
    second: ${"1\n2\n3"}
    third: ${"a\nb\nc"}
  `);
});

// Unicode-specific alignment benchmarks compare the default code-unit policy to
// the opt-in visual-width path. Competitor baselines do not exist here because
// dedent/outdent expose no equivalent Unicode column measurement hook.
summary(() => {
  const codeUnit = undent.with({ alignValues: true });

  bench("alignValues columns: ASCII 500 code-unit", () => {
    do_not_optimize(codeUnit`
      header:
        ${ML_500}
    `);
  }).gc("inner");

  bench("alignValues columns: ASCII 500 unicode", () => {
    do_not_optimize(undentAlignUnicode`
      header:
        ${ML_500}
    `);
  }).gc("inner");

  bench("alignValues columns: CJK 500 unicode", () => {
    do_not_optimize(undentAlignUnicode`
      header:
        ${UNICODE_CJK_500}
    `);
  }).gc("inner");

  bench("alignValues columns: emoji 500 unicode", () => {
    do_not_optimize(undentAlignUnicode`
      header:
        ${UNICODE_EMOJI_500}
    `);
  }).gc("inner");

  bench("alignValues columns: combining 500 unicode", () => {
    do_not_optimize(undentAlignUnicode`
      header:
        ${UNICODE_COMBINING_500}
    `);
  }).gc("inner");

  bench("alignValues columns: tabs 500 unicode", () => {
    do_not_optimize(undentAlignUnicodeTabs`
      header:\t${UNICODE_TAB_HEAVY_500}
    `);
  }).gc("inner");
});

summary(() => {
  bench("columnOffset: mixed unicode line", () => {
    do_not_optimize(columnOffset(UNICODE_MIXED_COLUMN_LINE));
  });

  bench("unicodeColumnOffset: mixed unicode line", () => {
    do_not_optimize(unicodeColumnOffsetDefault(UNICODE_MIXED_COLUMN_LINE));
  });

  bench("unicodeColumnOffset: tab-aware mixed line", () => {
    do_not_optimize(unicodeColumnOffsetTabs(UNICODE_MIXED_COLUMN_LINE));
  });

  bench("visualColumnWidth: mixed unicode line", () => {
    do_not_optimize(visualColumnWidth(UNICODE_MIXED_COLUMN_LINE));
  });
});

summary(() => {
  const multi = "x\ny";
  const wrapped = align(multi);

  bench("align branch: no wrapped values", () => {
    do_not_optimize(undent`
      first: ${multi}
      second: ${multi}
      third: ${multi}
    `);
  });

  bench("align branch: wrapped first interpolation", () => {
    do_not_optimize(undent`
      first: ${wrapped}
      second: ${multi}
      third: ${multi}
    `);
  });

  bench("align branch: wrapped middle interpolation", () => {
    do_not_optimize(undent`
      first: ${multi}
      second: ${wrapped}
      third: ${multi}
    `);
  });

  bench("align branch: wrapped last interpolation", () => {
    do_not_optimize(undent`
      first: ${multi}
      second: ${multi}
      third: ${wrapped}
    `);
  });
});

// =========================================================================
// 5. Configuration
// =========================================================================

summary(() => {
  bench(".with() single option", () => {
    do_not_optimize(undent.with({ trim: "none" }));
  });

  bench(".with() chained ×3", () => {
    do_not_optimize(
      undent
        .with({ trim: "none" })
        .with({ newline: "\r\n" })
        .with({ strategy: "first" }),
    );
  });

  bench("createUndent() from scratch", () => {
    do_not_optimize(
      createUndent({ strategy: "first", trim: "one", newline: "\n" }),
    );
  });
});

summary(() => {
  const trimAll = undent;
  const trimOne = undent.with({ trim: "one" });
  const trimNone = undent.with({ trim: "none" });

  bench("trim template: all", () => {
    do_not_optimize(trimAll`

      alpha
        beta

    `);
  });

  bench("trim template: one", () => {
    do_not_optimize(trimOne`

      alpha
        beta

    `);
  });

  bench("trim template: none", () => {
    do_not_optimize(trimNone`

      alpha
        beta

    `);
  });
});

summary(() => {
  const trimAll = undent;
  const trimOne = undent.with({ trim: "one" });
  const trimNone = undent.with({ trim: "none" });

  bench("trim string: all", () => {
    do_not_optimize(trimAll.string(TRIM_SAMPLE_STRING));
  });

  bench("trim string: one", () => {
    do_not_optimize(trimOne.string(TRIM_SAMPLE_STRING));
  });

  bench("trim string: none", () => {
    do_not_optimize(trimNone.string(TRIM_SAMPLE_STRING));
  });
});

summary(() => {
  const keep = undent;
  const lf = undent.with({ newline: "\n" });
  const crlf = undent.with({ newline: "\r\n" });

  bench("newline string: preserve original", () => {
    do_not_optimize(keep.string(MIXED_NEWLINES_1K));
  }).gc("inner");

  bench("newline string: normalize to LF", () => {
    do_not_optimize(lf.string(MIXED_NEWLINES_1K));
  }).gc("inner");

  bench("newline string: normalize to CRLF", () => {
    do_not_optimize(crlf.string(MIXED_NEWLINES_1K));
  }).gc("inner");
});

summary(() => {
  const common = undent;
  const first = undent.with({ strategy: "first" });
  const tsas = Array.from({ length: 100 }, () => {
    const strings = [
      "\n        first\n      second\n        third\n      fourth\n  ",
    ];
    return Object.assign([...strings], { raw: [...strings] }) as unknown as
      TemplateStringsArray;
  });

  bench("strategy template: common cold path ×100", () => {
    let last = "";
    for (let i = 0; i < tsas.length; i++) {
      last = common(tsas[i]!);
    }
    do_not_optimize(last);
  });

  bench("strategy template: first cold path ×100", () => {
    let last = "";
    for (let i = 0; i < tsas.length; i++) {
      last = first(tsas[i]!);
    }
    do_not_optimize(last);
  });
});

// =========================================================================
// 6. Cache effectiveness
// =========================================================================

summary(() => {
  bench("cache: hot path ×100", () => {
    let last: string = "";
    for (let i = 0; i < 100; i++) {
      last = undent`
        Hello ${i}
        World ${i}
      `;
    }
    do_not_optimize(last);
  });

  bench("cache: cold path ×100 (unique TSA)", () => {
    let last: string = "";
    for (let i = 0; i < 100; i++) {
      const tsa = makeTSA(2);
      last = undent(tsa, String(i));
    }
    do_not_optimize(last);
  });
});

summary(() => {
  const wrapped = align("alpha\nbeta\ngamma");
  const sameColumnTsa = makeInlineTSA("padding: ");
  const varyingColumnTsas = Array.from(
    { length: 32 },
    (_, i) => makeInlineTSA(`${" ".repeat(i)}pad: `),
  );

  bench("aligned cache: same wrapper same column ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent(sameColumnTsa, wrapped);
    }
    do_not_optimize(last);
  });

  bench("aligned cache: same wrapper varying columns ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent(varyingColumnTsas[i % varyingColumnTsas.length]!, wrapped);
    }
    do_not_optimize(last);
  });

  bench("aligned cache: recreated align wrapper same column ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent(sameColumnTsa, align("alpha\nbeta\ngamma"));
    }
    do_not_optimize(last);
  }).gc("inner");

  bench("aligned cache: recreated align wrapper varying columns ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent(
        varyingColumnTsas[i % varyingColumnTsas.length]!,
        align("alpha\nbeta\ngamma"),
      );
    }
    do_not_optimize(last);
  }).gc("inner");
});

summary(() => {
  bench("anchor cache: anchored hot path ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent`
        ${undent.indent}
        list:
          ${i}
      `;
    }
    do_not_optimize(last);
  });

  bench("anchor cache: auto-detect hot path ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent`
        list:
          ${i}
      `;
    }
    do_not_optimize(last);
  });
});

// Separate cache-behavior benchmarks for embed/embed-like patterns.
// These isolate repeated-input (hot) vs unique-input (cold) performance.
//
// Fairness notes:
// - "hot" precompute group isolates template-join/cache behavior by moving
//   embed-prep work out of the loop for all libraries.
// - "hot" inline group includes embed-prep work inside the loop for all
//   libraries, measuring end-to-end cost.
// - "cache safety" groups model eviction-heavy or attacker-shaped workloads:
//   many distinct snippets, many insertion columns, and oversized snippets that
//   intentionally bypass the shared aligned-text cache.
summary(() => {
  bench("embed hot: undent ×100", () => {
    const v = embed(INDENTED_1K);
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent`
        code:
          ${v}
      `;
    }
    do_not_optimize(last);
  });

  bench("embed-like hot: dedent ×100", () => {
    const v = npmDedent(INDENTED_1K);
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = npmDedentAlign`
        code:
          ${v}
      `;
    }
    do_not_optimize(last);
  });

  bench("embed-like hot: outdent ×100", () => {
    const v = embedLike(INDENTED_1K, npmOutdent.string, "        ");
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = npmOutdent`
        code:
          ${v}
      `;
    }
    do_not_optimize(last);
  });
});

summary(() => {
  bench("embed hot inline: undent ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      const v = embed(INDENTED_1K);
      last = undent`
        code:
          ${v}
      `;
    }
    do_not_optimize(last);
  });

  bench("embed-like hot inline: dedent ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      const v = npmDedent(INDENTED_1K);
      last = npmDedentAlign`
        code:
          ${v}
      `;
    }
    do_not_optimize(last);
  });

  bench("embed-like hot inline: outdent ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      const v = embedLike(INDENTED_1K, npmOutdent.string, "        ");
      last = npmOutdent`
        code:
          ${v}
      `;
    }
    do_not_optimize(last);
  });
});

summary(() => {
  const sameColumnTsa = makeInlineTSA("code: ");
  const varyingColumnTsas = Array.from(
    { length: 32 },
    (_, i) => makeInlineTSA(`${" ".repeat(i)}code: `),
  );

  bench("embed cache: recreated wrapper same column ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent(sameColumnTsa, embed(INDENTED_1K));
    }
    do_not_optimize(last);
  }).gc("inner");

  bench("embed cache: recreated wrapper varying columns ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent(
        varyingColumnTsas[i % varyingColumnTsas.length]!,
        embed(INDENTED_1K),
      );
    }
    do_not_optimize(last);
  }).gc("inner");
});

summary(() => {
  const sameColumnTsa = makeInlineTSA("code: ");
  const varyingColumnTsas = Array.from(
    { length: 32 },
    (_, i) => makeInlineTSA(`${" ".repeat(i)}code: `),
  );
  const distinctInputs = Array.from(
    { length: 100 },
    (_, i) => `${INDENTED_1K}\n        distinct_${i}`,
  );
  const oversizedInput = makeLines(5_000, "        ");

  bench("embed cache safety: distinct snippets same column ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent(sameColumnTsa, embed(distinctInputs[i]!));
    }
    do_not_optimize(last);
  }).gc("inner");

  bench("embed cache safety: distinct snippets varying columns ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = undent(
        varyingColumnTsas[i % varyingColumnTsas.length]!,
        embed(distinctInputs[i]!),
      );
    }
    do_not_optimize(last);
  }).gc("inner");

  bench("embed cache safety: oversized snippet varying columns ×25", () => {
    let last = "";
    for (let i = 0; i < 25; i++) {
      last = undent(
        varyingColumnTsas[i % varyingColumnTsas.length]!,
        embed(oversizedInput),
      );
    }
    do_not_optimize(last);
  }).gc("inner");
});

lineplot(() => {
  // deno-lint-ignore no-explicit-any
  bench("aligned cache: recreated wrapper varying $columns columns", function* (state: any) {
    const columns = state.get("columns");
    const varyingColumnTsas = Array.from(
      { length: columns },
      (_, i) => makeInlineTSA(`${" ".repeat(i)}code: `),
    );

    yield {
      [0]() {
        return varyingColumnTsas;
      },

      bench(tsas: TemplateStringsArray[]) {
        let last = "";
        for (let i = 0; i < 100; i++) {
          last = undent(tsas[i % tsas.length]!, align("alpha\nbeta\ngamma"));
        }
        do_not_optimize(last);
      },
    };
  }).range("columns", 1, 64).gc("inner");

  // deno-lint-ignore no-explicit-any
  bench("embed cache: recreated wrapper varying $columns columns", function* (state: any) {
    const columns = state.get("columns");
    const varyingColumnTsas = Array.from(
      { length: columns },
      (_, i) => makeInlineTSA(`${" ".repeat(i)}code: `),
    );

    yield {
      [0]() {
        return varyingColumnTsas;
      },

      bench(tsas: TemplateStringsArray[]) {
        let last = "";
        for (let i = 0; i < 100; i++) {
          last = undent(tsas[i % tsas.length]!, embed(INDENTED_1K));
        }
        do_not_optimize(last);
      },
    };
  }).range("columns", 1, 64).gc("inner");
});

summary(() => {
  bench("embed prep: undent same input ×100", () => {
    let last;
    for (let i = 0; i < 100; i++) {
      last = embed(INDENTED_1K);
    }
    do_not_optimize(last);
  }).gc("inner");

  bench("embed prep: dedent same input ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = npmDedent(INDENTED_1K);
    }
    do_not_optimize(last);
  }).gc("inner");

  bench("embed prep: outdent same input ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = npmOutdent.string(INDENTED_1K);
    }
    do_not_optimize(last);
  }).gc("inner");
});

summary(() => {
  const uniqueInputs = Array.from(
    { length: 100 },
    (_, i) => `${INDENTED_1K}\n        unique_${i}`,
  );

  bench("embed prep: undent unique ×100", () => {
    let last;
    for (let i = 0; i < 100; i++) {
      last = embed(uniqueInputs[i]!);
    }
    do_not_optimize(last);
  }).gc("inner");

  bench("embed prep: dedent unique ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = npmDedent(uniqueInputs[i]!);
    }
    do_not_optimize(last);
  }).gc("inner");

  bench("embed prep: outdent unique ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      last = npmOutdent.string(uniqueInputs[i]!);
    }
    do_not_optimize(last);
  }).gc("inner");
});

summary(() => {
  bench("embed cold: undent unique ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      const raw = `${INDENTED_1K}\n        unique_${i}`;
      last = undent`
        code:
          ${embed(raw)}
      `;
    }
    do_not_optimize(last);
  });

  bench("embed-like cold: dedent unique ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      const raw = `${INDENTED_1K}\n        unique_${i}`;
      const v = npmDedent(raw);
      last = npmDedentAlign`
        code:
          ${v}
      `;
    }
    do_not_optimize(last);
  });

  bench("embed-like cold: outdent unique ×100", () => {
    let last = "";
    for (let i = 0; i < 100; i++) {
      const raw = `${INDENTED_1K}\n        unique_${i}`;
      const v = embedLike(raw, npmOutdent.string, "        ");
      last = npmOutdent`
        code:
          ${v}
      `;
    }
    do_not_optimize(last);
  });
});

// Competitor comparison for cold-start template cost (unique TSA each call).
summary(() => {
  bench("undent cold path ×100 (unique TSA)", () => {
    let last: string = "";
    for (let i = 0; i < 100; i++) {
      const tsa = makeTSA(2);
      last = undent(tsa, String(i));
    }
    do_not_optimize(last);
  });

  bench("dedent cold path ×100 (unique TSA)", () => {
    let last: string = "";
    for (let i = 0; i < 100; i++) {
      const tsa = makeTSA(2);
      last = npmDedent(tsa, String(i));
    }
    do_not_optimize(last);
  });

  bench("outdent cold path ×100 (unique TSA)", () => {
    let last: string = "";
    for (let i = 0; i < 100; i++) {
      const tsa = makeTSA(2);
      last = npmOutdent(tsa, String(i));
    }
    do_not_optimize(last);
  });
});

// =========================================================================
// 7. Composition patterns
// =========================================================================

barplot(() => {
  bench("compose: nested undent + align", () => {
    const inner = undent`
      if (x) {
        go();
      }
    `;
    do_not_optimize(undent`
      function main() {
        ${align(inner)}
      }
    `);
  });

  bench("compose: 3 levels deep", () => {
    const leaf = "doStuff();";
    const branch = undent`
      if (x) {
        ${align(leaf)}
      }
    `;
    do_not_optimize(undent`
      function main() {
        ${align(branch)}
      }
    `);
  });

  bench("compose: anchor + align", () => {
    const items = "- a\n- b\n- c\n- d\n- e";
    do_not_optimize(undent`
      ${undent.indent}
        list:
          ${align(items)}
        done
    `);
  });

  bench("compose: anchor + embed", () => {
    const sql =
      "    SELECT *\n    FROM users\n    WHERE active = true\n    ORDER BY name";
    do_not_optimize(undent`
      ${undent.indent}
        query:
          ${embed(sql)}
    `);
  });
});

// =========================================================================
// 8. Exported primitives
// =========================================================================

summary(() => {
  bench("splitLines: 1K lines", () => {
    do_not_optimize(splitLines(LARGE_1K));
  });

  bench("rejoinLines: 1K lines", () => {
    const { lines, seps } = splitLines(LARGE_1K);
    do_not_optimize(rejoinLines(lines, seps));
  });
});

bench("alignText: 500 lines, 8-char pad", () => {
  do_not_optimize(alignText(ML_500, "        "));
}).gc("inner");

summary(() => {
  bench("alignText: 500 lines mostly content", () => {
    do_not_optimize(alignText(ML_500, "        "));
  }).gc("inner");

  bench("alignText: 500 lines mostly blank", () => {
    do_not_optimize(alignText(ML_500_MOSTLY_BLANK, "        "));
  }).gc("inner");
});

// deno-lint-ignore no-explicit-any
bench('columnOffset: $len chars', function* (state: any) {
  const n = state.get("len");
  const s = "a".repeat(n / 2) + "\n" + "b".repeat(n / 2);
  yield {
    [0]() {
      return s;
    },

    bench(input: string) {
      do_not_optimize(columnOffset(input));
    },
  };
}).range('len', 128, 16_384);

bench("dedentString: 1K lines", () => {
  do_not_optimize(dedentString(LARGE_1K));
}).gc("inner");

// Curiosity microbenchmark.
//
// This does not model an undent hot path directly. It exists to answer a
// practical implementation question: when we need repeated padding or marker
// strings, is a manual loop faster than the built-in `.repeat()` helper?
summary(() => {
  const chunk = "        ";
  const count = 32;

  bench("string repeat: .repeat() 8-char chunk ×32", () => {
    do_not_optimize(chunk.repeat(count));
  });

  bench("string repeat: for loop 8-char chunk ×32", () => {
    do_not_optimize(repeatWithLoop(chunk, count));
  });

  bench("string repeat: fill+join 8-char chunk ×32", () => {
    do_not_optimize(repeatWithFillJoin(chunk, count));
  });
});

summary(() => {
  const chunk = "0123456789abcdef0123456789abcdef";
  const count = 512;

  bench("string repeat: .repeat() 32-char chunk ×512", () => {
    do_not_optimize(chunk.repeat(count));
  }).gc("inner");

  bench("string repeat: for loop 32-char chunk ×512", () => {
    do_not_optimize(repeatWithLoop(chunk, count));
  }).gc("inner");

  bench("string repeat: fill+join 32-char chunk ×512", () => {
    do_not_optimize(repeatWithFillJoin(chunk, count));
  }).gc("inner");
});

summary(() => {
  const count = 32;

  bench("space repeat: .repeat() ×32", () => {
    do_not_optimize(' '.repeat(count));
  });

  bench("space repeat: for loop ×32", () => {
    do_not_optimize(repeatWithLoop(' ', count));
  });

  bench("space repeat: fill+join ×32", () => {
    do_not_optimize(repeatWithFillJoin(' ', count));
  });
});

summary(() => {
  const count = 512;

  bench("space repeat: .repeat() ×512", () => {
    do_not_optimize(' '.repeat(count));
  }).gc("inner");

  bench("space repeat: for loop ×512", () => {
    do_not_optimize(repeatWithLoop(' ', count));
  }).gc("inner");

  bench("space repeat: fill+join ×512", () => {
    do_not_optimize(repeatWithFillJoin(' ', count));
  }).gc("inner");
});

// =========================================================================
// 9. Pathological inputs
// =========================================================================

boxplot(() => {
  bench("pathological: 200-char indent, 100 lines", () => {
    do_not_optimize(undent.string(DEEP_INDENT_100));
  });

  bench("pathological: 1K blank lines", () => {
    do_not_optimize(undent.string(ALL_BLANK_1K));
  });

  bench("pathological: mixed indent 500 lines", () => {
    do_not_optimize(undent.string(MIXED_INDENT_500));
  });

  bench("pathological: single 100K-char line", () => {
    do_not_optimize(undent.string(LONG_LINE));
  }).gc("inner");

  bench("pathological: whitespace-only template", () => {
    do_not_optimize(undent`
            `);
  });
});

// =========================================================================
// 10. Real-world scenarios
//
// Patterns people actually write with undent in production.
// =========================================================================

summary(() => {
  bench("real: code generation (fn + 3 interps)", () => {
    const name = "processUser";
    const args = "user: User, options: Options";
    const body =
      "validate(user);\nconst result = transform(user, options);\nreturn result;";
    do_not_optimize(undent`
      export function ${name}(${args}) {
        ${align(body)}
      }
    `);
  });

  bench("real: config file (8 key-values)", () => {
    const host = "localhost", port = 5432, db = "myapp", user = "admin";
    const ssl = true, pool = 10, timeout = 30000, retry = 3;
    do_not_optimize(undent`
      database:
        host: ${host}
        port: ${port}
        name: ${db}
        user: ${user}
        ssl: ${ssl}
        pool_size: ${pool}
        timeout: ${timeout}
        retry_count: ${retry}
    `);
  });

  bench("real: SQL with embed()", () => {
    const table = "users";
    const whereClause = "    active = true\n    AND created_at > '2024-01-01'";
    do_not_optimize(undent`
      SELECT *
      FROM ${table}
      WHERE
        ${embed(whereClause)}
      ORDER BY name
    `);
  });
});

// Hot loop — same template called many times with different values
bench("real: hot loop ×500 (server-side pattern)", () => {
  let last: string = "";
  for (let i = 0; i < 500; i++) {
    last = undent`
      {"id": ${i}, "name": "user_${i}", "active": ${i % 2 === 0}}
    `;
  }
  do_not_optimize(last);
});

// First-call cost — unique template (cold cache)
bench("real: first-call cost (cold template)", () => {
  const tsa = makeTSA(3);
  do_not_optimize(undent(tsa, "hello", "world"));
});

// =========================================================================
// Run
// =========================================================================

await run();
