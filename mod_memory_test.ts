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
 * V8's GC is generational — a single `gc()` call typically only scavenges
 * the young generation. Objects promoted to old-gen require a major (full)
 * cycle, which needs 2–3 calls to reliably trigger. Calling three times in
 * succession gives the collector enough passes to reclaim old-gen survivors
 * and produce a stable heap baseline for before/after comparisons.
 *
 * `deno task test` passes `--v8-flags=--expose-gc` which makes
 * `globalThis.gc()` available in V8.
 */
function forceGCIfAvailable(): void {
  const maybeGlobal = globalThis as unknown as { gc?: () => void };
  if (typeof maybeGlobal.gc === "function") {
    maybeGlobal.gc();
    maybeGlobal.gc();
    maybeGlobal.gc();
    return;
  }

  const maybeBun = globalThis as unknown as {
    Bun?: { gc?: (force?: boolean) => void };
  };
  if (typeof maybeBun.Bun?.gc === "function") {
    maybeBun.Bun.gc(true);
    maybeBun.Bun.gc(true);
    maybeBun.Bun.gc(true);
  }
}

/**
 * Assert that repeated calls to `fn` do not retain memory across iterations.
 *
 * A single before/after heap snapshot cannot reliably distinguish a real leak
 * from initialisation overhead (JIT compilation, WeakMap warming, first-pass
 * object promotion). This helper uses a two-phase growth-rate check instead:
 *
 * ```
 * warm-up (warmupCount iters)
 *   └─ lets JIT settle, populates caches, promotes short-lived objects
 * GC × 3  →  snapshot[0]
 * phase 1 (iterCount iters)  →  GC × 3  →  snapshot[1]
 * phase 2 (iterCount iters)  →  GC × 3  →  snapshot[2]
 *
 * assert: (snapshot[2] − snapshot[1]) < thresholdKB
 * ```
 *
 * If memory grows between snapshot[0]→[1] but is flat between [1]→[2], the
 * growth was one-time initialisation, not a leak. If it grows proportionally
 * in both phases, something is being retained across iterations.
 *
 * When heap measurement is unavailable the assertion is skipped rather than
 * trivially passing with a zero delta.
 *
 * @param fn         - Operation to repeat. Called warmupCount + iterCount × 2 times total.
 * @param iterCount  - Iterations per measurement phase. Default: 5 000.
 * @param thresholdKB - Maximum tolerated growth (KB) in the second phase. Default: 512.
 * @param warmupCount - Warm-up iterations before any measurement. Default: 500.
 */
function assertNoLeak(
  fn: () => void,
  iterCount = 5_000,
  thresholdKB = 512,
  warmupCount = 500,
): void {
  // Warm-up: let JIT compile, populate WeakMap caches, and flush short-lived
  // allocations so they don't pollute the measured phases.
  for (let i = 0; i < warmupCount; i++) fn();

  forceGCIfAvailable();
  // snapshot[0] not strictly needed but useful for debugging if a test fails.

  // Phase 1
  for (let i = 0; i < iterCount; i++) fn();
  forceGCIfAvailable();
  const after1 = readHeapUsedBytes();

  // Phase 2 — if memory is flat here, phase 1 growth was initialisation cost.
  for (let i = 0; i < iterCount; i++) fn();
  forceGCIfAvailable();
  const after2 = readHeapUsedBytes();

  if (after1 === null || after2 === null) return; // measurement unavailable

  const deltaKB = (after2 - after1) / 1024;
  expect(deltaKB).toBeLessThan(thresholdKB);
}

// ---------------------------------------------------------------------------
// Memory regression tests
// ---------------------------------------------------------------------------

describe("memory regression", () => {
  it(".string() does not retain memory across calls (5K-line input)", () => {
    const input = makeLines(5000, "    ");
    // Large input — fewer iterations per phase; threshold is looser because
    // each call produces a large output string that legitimately lives until
    // the next GC pass.
    assertNoLeak(() => undent.string(input), 1_000, 1024);
  });

  it("tag does not retain memory on the hot cache path", () => {
    // Uses a literal TSA so the WeakMap cache is hit on every iteration.
    // Memory should stay flat after warm-up once the cached entry is stable.
    let i = 0;
    assertNoLeak(() => {
      undent`
        Hello ${i}
        World ${i++}
      `;
    });
  });

  it(".with() does not accumulate instances across calls", () => {
    let i = 0;
    assertNoLeak(() => {
      const inst = undent.with({ trim: "none" });
      inst`test ${i++}`;
    });
  });

  it("cold TSA does not grow the WeakMap unboundedly", () => {
    // Each iteration creates a fresh TSA — a new WeakMap key. WeakMap entries
    // for unreachable keys must be collectable; if they are not, heap grows
    // proportionally with iteration count.
    let i = 0;
    assertNoLeak(() => {
      const tsa = makeTSA(2);
      undent(tsa, String(i++));
    });
  });

  it("align() does not retain 1K-line values across calls", () => {
    let i = 0;
    const big = makeLines(1_000);
    assertNoLeak(
      () => {
        undent`
        header:
          ${align(big)}
      `;
        i++;
      },
      2_000,
      1024,
    );
  });

  it("embed() does not retain 1K-line values across calls", () => {
    let i = 0;
    const indented = makeLines(1_000, "        ");
    assertNoLeak(
      () => {
        undent`
        code:
          ${embed(indented)}
      `;
        i++;
      },
      2_000,
      1024,
    );
  });
});
