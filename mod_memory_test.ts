// deno-lint-ignore-file no-import-prefix no-unversioned-import
/**
 * Memory regression tests for @okikio/undent.
 *
 * These tests verify that hot-path operations don't leak memory across
 * thousands of iterations. They are separate from the behavioral tests
 * in mod_test.ts because they require explicit GC exposure for reliable
 * heap measurements.
 *
 * For best signal, run with GC flags enabled (already included in
 * `deno task test`):
 *
 *   deno test --trace-leaks --v8-flags=--expose-gc mod_memory_test.ts
 *
 * When the heap measurement API is unavailable (e.g. some environments
 * don't expose `memoryUsage()`), each test passes unconditionally. The
 * assertion is skipped rather than failing on an unmeasurable quantity.
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import undent, { align, embed } from "./mod.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a multi-line indented string with `count` lines. */
function makeLines(count: number, indent = "    "): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`${indent}line ${i}`);
  return out.join("\n");
}

/** Build a synthetic TemplateStringsArray with `segmentCount` segments. */
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
 * Read current heap-used bytes. Returns `null` when the runtime's
 * memory API is unavailable, so callers can skip assertions gracefully.
 */
function readHeapUsedBytes(): number | null {
  const maybeDeno = globalThis as unknown as {
    Deno?: { memoryUsage?: () => { heapUsed: number } };
  };
  if (typeof maybeDeno.Deno?.memoryUsage === "function") {
    return maybeDeno.Deno.memoryUsage().heapUsed;
  }

  const maybeProcess = globalThis as unknown as {
    process?: { memoryUsage?: () => { heapUsed: number } };
  };
  if (typeof maybeProcess.process?.memoryUsage === "function") {
    return maybeProcess.process.memoryUsage().heapUsed;
  }

  return null;
}

/**
 * Trigger a full GC cycle if the runtime exposes one.
 *
 * Without explicit GC, heap measurements include unreachable objects
 * from previous iterations, inflating the delta artificially.
 * `deno task test` passes `--v8-flags=--expose-gc` which makes
 * `globalThis.gc()` available in V8.
 */
function forceGCIfAvailable(): void {
  const maybeGlobal = globalThis as unknown as { gc?: () => void };
  if (typeof maybeGlobal.gc === "function") {
    maybeGlobal.gc();
    return;
  }

  const maybeBun = globalThis as unknown as {
    Bun?: { gc?: (force?: boolean) => void };
  };
  if (typeof maybeBun.Bun?.gc === "function") {
    maybeBun.Bun.gc(true);
  }
}

/**
 * Run `fn`, measure heap growth with GC on both sides, and assert the
 * delta stays under `thresholdKB` kilobytes.
 *
 * When heap measurement is unavailable the assertion is skipped rather
 * than trivially passing with a zero delta.
 */
function assertNoLeak(fn: () => void, thresholdKB: number): void {
  forceGCIfAvailable();
  const before = readHeapUsedBytes();

  fn();

  forceGCIfAvailable();
  const after = readHeapUsedBytes();

  if (before === null || after === null) return; // measurement unavailable

  const deltaKB = (after - before) / 1024;
  expect(deltaKB).toBeLessThan(thresholdKB);
}

// ---------------------------------------------------------------------------
// Memory regression tests
// ---------------------------------------------------------------------------

describe("memory regression", () => {
  it(".string() × 10K (5K-line input) stays under 1 MB", () => {
    const input = makeLines(5000, "    ");
    assertNoLeak(() => {
      for (let i = 0; i < 10_000; i++) undent.string(input);
    }, 1000);
  });

  it("tag × 15K (hot cache) stays under 1 MB", () => {
    assertNoLeak(() => {
      for (let i = 0; i < 15_000; i++) {
        undent`
          Hello ${i}
          World ${i}
        `;
      }
    }, 1000);
  });

  it(".with() × 10K new instances stays under 1 MB", () => {
    assertNoLeak(() => {
      for (let i = 0; i < 10_000; i++) {
        const inst = undent.with({ trim: "none" });
        inst`test ${i}`;
      }
    }, 1000);
  });

  it("cold TSA × 10K (WeakMap churn) stays under 1 MB", () => {
    assertNoLeak(() => {
      for (let i = 0; i < 10_000; i++) {
        const tsa = makeTSA(2);
        undent(tsa, String(i));
      }
    }, 1000);
  });

  it("align() × 10K with 1K-line values stays under 1 MB", () => {
    let big = "";
    for (let i = 0; i < 1_000; i++) {
      big += `line ${i}\n`;
    }
    assertNoLeak(() => {
      for (let i = 0; i < 10_000; i++) {
        undent`
          header:
            ${align(big)}
        `;
      }
    }, 1000);
  });

  it("embed() × 10K with 1K-line values stays under 1 MB", () => {
    const indented = makeLines(1_000, "        ");
    assertNoLeak(() => {
      for (let i = 0; i < 10_000; i++) {
        undent`
          code:
            ${embed(indented)}
        `;
      }
    }, 1000);
  });
});
