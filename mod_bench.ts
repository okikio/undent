/**
 * @module bench
 *
 * Benchmarks for undent using mitata.
 *
 * Run:
 *   deno run -A bench.ts
 *   deno run -A --v8-flags=--expose-gc bench.ts   # more accurate GC metrics
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
 *  11.  Memory pressure — heap delta checks (before benchmark loop)
 */

import { run, bench, summary, boxplot, barplot, lineplot, do_not_optimize } from "npm:mitata";

import undent, {
  align,
  embed,
  createUndent,
  dedentString,
  splitLines,
  rejoinLines,
  alignText,
  columnOffset,
} from "./mod.ts";

// Competitors
import npmDedent from "npm:dedent";
import { outdent as npmOutdent } from "npm:outdent";

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
  return Object.assign([...strings], { raw: [...strings] }) as unknown as TemplateStringsArray;
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
// 11. Memory pressure (runs first, before bench loop takes over)
// =========================================================================

async function runMemoryTests(): Promise<void> {
  const SEP = "─".repeat(64);
  console.log(`\n${SEP}`);
  console.log("  MEMORY PRESSURE TESTS");
  console.log(SEP);

  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  const forceGC = () => { if (gc) gc(); };

  interface MemTest {
    name: string;
    threshold: number;
    fn: () => void;
  }

  const tests: MemTest[] = [
    {
      name: ".string() × 10K (5K lines)",
      threshold: 1000,
      fn() {
        const input = makeLines(5000, "    ");
        for (let i = 0; i < 10_000; i++) undent.string(input);
      },
    },
    {
      name: "tag × 15K (hot cache)",
      threshold: 1000,
      fn() {
        for (let i = 0; i < 15_000; i++) {
          undent`
            Hello ${i}
            World ${i}
          `;
        }
      },
    },
    {
      name: ".with() × 10K instances",
      threshold: 1000,
      fn() {
        for (let i = 0; i < 10_000; i++) {
          const inst = undent.with({ trim: "none" });
          inst`test ${i}`;
        }
      },
    },
    {
      name: "cold TSA × 10K (WeakMap churn)",
      threshold: 1000,
      fn() {
        for (let i = 0; i < 10_000; i++) {
          const tsa = makeTSA(2);
          undent(tsa, String(i));
        }
      },
    },
    {
      name: "align() × 10K (1K-line values)",
      threshold: 1000,
      fn() {
        let big = "";
        for (let i = 0; i < 1_000; i++) {
          big += `line ${i}\n`;
        }

        for (let i = 0; i < 10_000; i++) {
          undent`
            header:
              ${align(big)}
          `;
        }
      },
    },
    {
      name: "embed() × 10K (1K-line values)",
      threshold: 1000,
      fn() {
        const indented = makeLines(1_000, "        ");
        for (let i = 0; i < 10_000; i++) {
          undent`
            code:
              ${embed(indented)}
          `;
        }
      },
    },
  ];

  for (const t of tests) {
    forceGC();
    const before = Deno.memoryUsage();
    t.fn();
    forceGC();
    const after = Deno.memoryUsage();
    const delta = (after.heapUsed - before.heapUsed) / 1024;
    const ok = delta < t.threshold;
    const icon = ok ? "✓" : "⚠";
    console.log(
      `  ${icon} ${t.name.padEnd(36)} heap Δ ${delta.toFixed(0).padStart(6)} KB` +
        `  (limit: ${t.threshold} KB)`,
    );
  }

  console.log(SEP);
  console.log(
    "  Note: V8 GC is non-deterministic. Deltas under ~1 MB after 10K+\n" +
      "  iterations indicate no meaningful leak. Use --v8-flags=--expose-gc\n" +
      "  for more accurate results.",
  );
  console.log(`${SEP}\n`);
}

await runMemoryTests();

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
    [0]() { return vals.map((_, i) => String(i + Math.random())); },
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
    i % 3 === 0 ? "\r\n" : i % 3 === 1 ? "\r" : "\n"
  ) + "\r\n" + makeLines(500, "    ");
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
    do_not_optimize(createUndent({ strategy: "first", trim: "one", newline: "\n" }));
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
    const sql = "    SELECT *\n    FROM users\n    WHERE active = true\n    ORDER BY name";
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
    const body = "validate(user);\nconst result = transform(user, options);\nreturn result;";
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