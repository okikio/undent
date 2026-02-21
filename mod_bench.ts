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
const MED_100 = makeLines(100);
const LARGE_1K = makeLines(1_000);
const LARGE_5K = makeLines(5_000);
const LARGE_10K = makeLines(10_000);

const INDENTED_100 = makeLines(100, "        ");
const INDENTED_1K = makeLines(1_000, "        ");

const ML_50 = Array.from({ length: 50 }, (_, i) => `item ${i}`).join("\n");
const ML_500 = Array.from({ length: 500 }, (_, i) => `item ${i}`).join("\n");
const ML_5K = Array.from({ length: 5_000 }, (_, i) => `item ${i}`).join("\n");

const DEEP_INDENT_100 = makeLines(100, " ".repeat(200));
const ALL_BLANK_1K = Array.from({ length: 1000 }, () => "   ").join("\n");
const MIXED_INDENT_500 = Array.from(
  { length: 500 },
  (_, i) => " ".repeat(i % 20) + `line ${i}`,
).join("\n");
const LONG_LINE = "    " + "x".repeat(100_000);

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
bench(function* tag_N_interpolations(state: any) {
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
}).args("n", [10, 50, 100]);

// =========================================================================
// 3. String algorithm — .string() scaling
// =========================================================================

lineplot(() => {
  // deno-lint-ignore no-explicit-any
  bench(function* string_N_lines(state: any) {
    const n = state.get("lines");
    const data: Record<number, string> = {
      10: SMALL_10,
      100: MED_100,
      1000: LARGE_1K,
      5000: LARGE_5K,
      10000: LARGE_10K,
    };
    const input = data[n]!;
    yield () => do_not_optimize(undent.string(input));
  }).args("lines", [10, 100, 1000, 5000, 10000]);
});

bench("string: mixed newlines 1K", () => {
  const mixed = makeLines(500, "    ").replace(/\n/g, (_, i: number) =>
    i % 3 === 0 ? "\r\n" : i % 3 === 1 ? "\r" : "\n") +
    "\r\n" + makeLines(500, "    ");
  do_not_optimize(undent.string(mixed));
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

// Separate cache-behavior benchmarks for embed/embed-like patterns.
// These isolate repeated-input (hot) vs unique-input (cold) performance.
//
// Fairness notes:
// - "hot" precompute group isolates template-join/cache behavior by moving
//   embed-prep work out of the loop for all libraries.
// - "hot" inline group includes embed-prep work inside the loop for all
//   libraries, measuring end-to-end cost.
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

// deno-lint-ignore no-explicit-any
bench(function* columnOffset_len(state: any) {
  const n = state.get("len");
  const s = "a".repeat(n / 2) + "\n" + "b".repeat(n / 2);
  yield () => do_not_optimize(columnOffset(s));
}).args("len", [100, 1000, 10000]);

bench("dedentString: 1K lines", () => {
  do_not_optimize(dedentString(LARGE_1K));
}).gc("inner");

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
