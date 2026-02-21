// deno-lint-ignore-file no-import-prefix no-unversioned-import
import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import * as fc from "npm:fast-check";
import undent, {
  align,
  alignText,
  columnOffset,
  dedent,
  dedentString,
  DEFAULTS,
  embed,
  indent,
  isAligned,
  newlineLengthAt,
  outdent,
  rejoinLines,
  resolveOptions,
  splitLines,
  undent as namedUndent,
} from "./mod.ts";
import type {
  AlignedValue,
  ResolvedOptions,
  TrimMode,
  TrimSides,
  Undent,
  UndentOptions,
} from "./mod.ts";

// Competitors for oracle tests
import npmDedent from "npm:dedent";
import { outdent as npmOutdent } from "npm:outdent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract non-whitespace characters from a string, preserving order. */
function contentChars(s: string): string {
  return s.replace(/[\s]/g, "");
}

/** Count lines in a string (number of newline sequences + 1). */
function lineCount(s: string): number {
  if (s.length === 0) return 0;
  const { lines } = splitLines(s);
  return lines.length;
}

/** Build a synthetic TemplateStringsArray. */
function makeTSA(segments: string[]): TemplateStringsArray {
  return Object.assign([...segments], {
    raw: [...segments],
  }) as unknown as TemplateStringsArray;
}

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for strings with varied whitespace and content. */
const arbMultilineString: fc.Arbitrary<string> = fc.array(
  fc.oneof(
    fc.constant(" "),
    fc.constant("\t"),
    fc.constant("\n"),
    fc.constant("\r\n"),
    fc.constant("\r"),
    fc.constantFrom("a", "b", "c", "x", "y", "0", "1", "-", "_", ":"),
  ),
  { minLength: 0, maxLength: 80 },
).map((arr) => arr.join(""));

/** Arbitrary for indented multi-line strings (more realistic inputs). */
const arbIndentedBlock: fc.Arbitrary<string> = fc.tuple(
  fc.integer({ min: 0, max: 12 }),
  fc.array(fc.string({ minLength: 0, maxLength: 40 }), {
    minLength: 1,
    maxLength: 20,
  }),
).map(([indent, lines]: [number, string[]]) => {
  const pad = " ".repeat(indent);
  return lines.map((l) => l.trim().length === 0 ? "" : pad + l).join("\n");
});

/** Arbitrary for template-like strings (leading newline + indented body + trailing whitespace). */
const arbTemplateLike: fc.Arbitrary<string> = fc.tuple(
  fc.integer({ min: 2, max: 8 }),
  fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
    minLength: 1,
    maxLength: 10,
  }),
).map(([indent, lines]: [number, string[]]) => {
  const pad = " ".repeat(indent);
  const body = lines.map((l) => pad + l).join("\n");
  return "\n" + body + "\n" + " ".repeat(Math.max(0, indent - 2));
});

// ---------------------------------------------------------------------------
// Basic behaviour (original 205 tests)
// ---------------------------------------------------------------------------

describe("undent", () => {
  describe("tagged template literal", () => {
    it("strips common indentation from a simple block", () => {
      const result = undent`
        Hello
        World
      `;
      expect(result).toBe("Hello\nWorld");
    });

    it("preserves relative indentation", () => {
      const result = undent`
        Hello
          Indented
        Back
      `;
      expect(result).toBe("Hello\n  Indented\nBack");
    });

    it("handles a single line", () => {
      const result = undent`
        Hello
      `;
      expect(result).toBe("Hello");
    });

    it("returns empty string for an empty template", () => {
      const result = undent``;
      expect(result).toBe("");
    });

    it("returns empty string for whitespace-only template", () => {
      const result = undent`
      `;
      expect(result).toBe("");
    });

    it("handles no indentation", () => {
      const result = undent`
Hello
World
      `;
      expect(result).toBe("Hello\nWorld");
    });

    it("handles content on first line (no leading newline)", () => {
      const result = undent`Hello
        World`;
      expect(result).toBe("Hello\nWorld");
    });
  });

  // -------------------------------------------------------------------------
  // Interpolation
  // -------------------------------------------------------------------------

  describe("interpolation", () => {
    it("handles a single interpolated value", () => {
      const name = "World";
      const result = undent`
        Hello ${name}
      `;
      expect(result).toBe("Hello World");
    });

    it("handles multiple interpolated values", () => {
      const a = "one";
      const b = "two";
      const c = "three";
      const result = undent`
        ${a} and ${b} and ${c}
      `;
      expect(result).toBe("one and two and three");
    });

    it("coerces non-string values via String()", () => {
      const num = 42;
      const bool = true;
      const nul = null;
      const result = undent`
        ${num} ${bool} ${nul}
      `;
      expect(result).toBe("42 true null");
    });

    it("preserves newlines inside interpolated values", () => {
      const multi = "line1\nline2";
      const result = undent`
        before ${multi} after
      `;
      expect(result).toBe("before line1\nline2 after");
    });

    it("handles interpolation at the start of a line", () => {
      const val = "start";
      const result = undent`
        ${val} end
      `;
      expect(result).toBe("start end");
    });

    it("handles interpolation at the end of a line", () => {
      const val = "end";
      const result = undent`
        start ${val}
      `;
      expect(result).toBe("start end");
    });

    it("handles adjacent interpolations", () => {
      const a = "foo";
      const b = "bar";
      const result = undent`
        ${a}${b}
      `;
      expect(result).toBe("foobar");
    });
  });

  // -------------------------------------------------------------------------
  // Newline handling
  // -------------------------------------------------------------------------

  describe("newline handling", () => {
    it("handles \\r\\n line endings", () => {
      const result = undent.string("\r\n    Hello\r\n    World\r\n  ");
      expect(result).toBe("Hello\r\nWorld");
    });

    it("handles \\r line endings", () => {
      const result = undent.string("\r    Hello\r    World\r  ");
      expect(result).toBe("Hello\rWorld");
    });

    it("handles mixed line endings", () => {
      const result = undent.string("\n    Hello\r\n    World\r    Foo\n  ");
      expect(result).toBe("Hello\r\nWorld\rFoo");
    });

    it("preserves blank lines in content", () => {
      const result = undent`
        Hello

        World
      `;
      expect(result).toBe("Hello\n\nWorld");
    });

    it("preserves multiple blank lines", () => {
      const result = undent`
        Hello


        World
      `;
      expect(result).toBe("Hello\n\n\nWorld");
    });
  });

  // -------------------------------------------------------------------------
  // Options via .with()
  // -------------------------------------------------------------------------

  describe(".with()", () => {
    describe("trim modes", () => {
      it("trim 'none' preserves both edges", () => {
        const keep = undent.with({ trim: "none" });
        const result = keep`
          Hello
        `;
        expect(result).toBe("\nHello\n");
      });

      it("trim 'all' (default) removes all blank wrapper lines", () => {
        const result = undent`
          Hello
        `;
        expect(result).toBe("Hello");
      });

      it("trim 'one' removes at most one newline from each edge", () => {
        const one = undent.with({ trim: "one" });
        const result = one`
          Hello
        `;
        expect(result).toBe("Hello");
      });

      it("trim 'one' preserves extra blank lines", () => {
        const one = undent.with({ trim: "one" });
        const result = one`

          Hello

        `;
        expect(result).toBe("\nHello\n");
      });

      it("trim 'none' preserves whitespace in empty template", () => {
        const keep = undent.with({ trim: "none" });
        const result = keep`
        `;
        expect(result).toBe("\n");
      });

      it("asymmetric trim — leading: none, trailing: all", () => {
        const asym = undent.with({
          trim: { leading: "none", trailing: "all" },
        });
        const result = asym`
          Hello
        `;
        expect(result).toBe("\nHello");
      });

      it("asymmetric trim — leading: all, trailing: none", () => {
        const asym = undent.with({
          trim: { leading: "all", trailing: "none" },
        });
        const result = asym`
          Hello
        `;
        expect(result).toBe("Hello\n");
      });

      it("asymmetric trim — leading: one, trailing: none", () => {
        const asym = undent.with({
          trim: { leading: "one", trailing: "none" },
        });
        const result = asym`

          Hello
        `;
        expect(result).toBe("\nHello\n");
      });
    });

    describe("strategy", () => {
      it("'common' (default) uses minimum indent across all lines", () => {
        const result = undent`
          Hello
            Indented
          Back
        `;
        expect(result).toBe("Hello\n  Indented\nBack");
      });

      it("'first' uses indent from first content line", () => {
        const first = undent.with({ strategy: "first" });
        const result = first`
            Hello
          Less indented
        `;
        expect(result).toBe("Hello\nLess indented");
      });
    });

    describe("newline normalization", () => {
      it("normalizes to \\r\\n", () => {
        const crlf = undent.with({ newline: "\r\n" });
        const result = crlf`
          first
          second
        `;
        expect(result).toBe("first\r\nsecond");
      });

      it("normalizes to arbitrary string (space)", () => {
        const space = undent.with({ newline: " " });
        const result = space`
          Hello
          World
        `;
        expect(result).toBe("Hello World");
      });

      it("does not normalize newlines in interpolated values", () => {
        const crlf = undent.with({ newline: "\r\n" });
        const inner = "a\nb";
        const result = crlf`
          before ${inner} after
        `;
        expect(result).toBe("before a\nb after");
      });

      it("leaves newlines alone when null (default)", () => {
        const result = undent.string("\n    Hello\r\n    World\n  ");
        expect(result).toBe("Hello\r\nWorld");
      });
    });

    describe("option composition", () => {
      it("creates independent instances that don't affect each other", () => {
        const a = undent.with({ trim: { leading: "none" } });
        const b = undent.with({ trim: { trailing: "none" } });
        const resultA = a`
          Hello
        `;
        const resultB = b`
          Hello
        `;
        expect(resultA).toBe("\nHello");
        expect(resultB).toBe("Hello\n");
      });

      it("supports chained .with()", () => {
        const step1 = undent.with({ trim: { leading: "none" } });
        const step2 = step1.with({ newline: "\r\n" });
        const result = step2`
          first
          second
        `;
        expect(result).toBe("\r\nfirst\r\nsecond");
      });
    });

    describe("alignValues option", () => {
      it("automatically aligns all multi-line interpolated values", () => {
        const ua = undent.with({ alignValues: true });
        const list = "- a\n- b\n- c";
        const result = ua`
          items:
            ${list}
          done
        `;
        expect(result).toBe("items:\n  - a\n  - b\n  - c\ndone");
      });

      it("aligns multiple values independently", () => {
        const ua = undent.with({ alignValues: true });
        const a = "x\ny";
        const b = "1\n2";
        const result = ua`
          first: ${a}
          second: ${b}
        `;
        expect(result).toBe("first: x\n       y\nsecond: 1\n        2");
      });

      it("leaves single-line values alone", () => {
        const ua = undent.with({ alignValues: true });
        const result = ua`
          Hello ${"World"}
        `;
        expect(result).toBe("Hello World");
      });

      it("works with other options simultaneously", () => {
        const keep = undent.with({
          alignValues: true,
          trim: { leading: "none" },
        });
        const val = "a\nb";
        const result = keep`
          ${val}
        `;
        expect(result).toBe("\na\nb");
      });

      it("stacks with align() wrappers (redundant but safe)", () => {
        const ua = undent.with({ alignValues: true });
        const val = "a\nb";
        const result = ua`
          ${align(val)}
        `;
        expect(result).toBe("a\nb");
      });

      it("handles code generation pattern", () => {
        const ua = undent.with({ alignValues: true });
        const methods =
          "greet() {\n  console.log('hi');\n}\n\nbye() {\n  console.log('bye');\n}";
        const result = ua`
          class Foo {
            ${methods}
          }
        `;
        expect(result).toBe(
          "class Foo {\n  greet() {\n    console.log('hi');\n  }\n\n  bye() {\n    console.log('bye');\n  }\n}",
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // .string()
  // -------------------------------------------------------------------------

  describe(".string()", () => {
    it("strips indentation from a plain string", () => {
      const result = undent.string("\nHello\nWorld\n");
      expect(result).toBe("Hello\nWorld");
    });

    it("handles a string with no indentation", () => {
      const result = undent.string("Hello\nWorld");
      expect(result).toBe("Hello\nWorld");
    });

    it("handles a string with no leading newline", () => {
      const result = undent.string("    Hello\n    World");
      expect(result).toBe("Hello\nWorld");
    });

    it("returns empty string for empty input", () => {
      expect(undent.string("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(undent.string("   ")).toBe("");
    });

    it("preserves relative indentation in plain strings", () => {
      const result = undent.string("\n    Hello\n      Indented\n    Back\n  ");
      expect(result).toBe("Hello\n  Indented\nBack");
    });

    it("works on configured instances with newline normalization", () => {
      const crlf = undent.with({ newline: "\r\n" });
      const result = crlf.string("\n    first\n    second\n  ");
      expect(result).toBe("first\r\nsecond");
    });

    it("handles strings with no newlines", () => {
      const result = undent.string("Hello World");
      expect(result).toBe("Hello World");
    });

    it("handles only newlines", () => {
      const result = undent.string("\n\n\n");
      expect(result).toBe("");
    });

    it("never destroys content (regression test)", () => {
      const result = undent.string("  hello\n    world\nfoo");
      expect(result).toBe("  hello\n    world\nfoo");
    });
  });

  // -------------------------------------------------------------------------
  // Caching
  // -------------------------------------------------------------------------

  describe("caching", () => {
    it("returns identical results for repeated calls with same template", () => {
      function render(name: string) {
        return undent`
          Hello ${name}
        `;
      }
      expect(render("Alice")).toBe("Hello Alice");
      expect(render("Bob")).toBe("Hello Bob");
    });

    it("handles different templates independently", () => {
      const a = undent`
        Hello
      `;
      const b = undent`
        World
      `;
      expect(a).toBe("Hello");
      expect(b).toBe("World");
    });
  });

  // -------------------------------------------------------------------------
  // Module exports
  // -------------------------------------------------------------------------

  describe("module exports", () => {
    it("default export is a function", () => {
      expect(typeof undent).toBe("function");
    });

    it("named export matches default export", () => {
      expect(namedUndent).toBe(undent);
    });

    it("has .string method", () => {
      expect(typeof undent.string).toBe("function");
    });

    it("has .with method", () => {
      expect(typeof undent.with).toBe("function");
    });

    it("has .indent symbol", () => {
      expect(typeof undent.indent).toBe("symbol");
    });

    it("exports indent symbol directly", () => {
      expect(indent).toBe(undent.indent);
    });

    it("satisfies Undent interface at runtime", () => {
      const tag: unknown = undent;
      expect(typeof tag).toBe("function");
      expect(typeof (tag as Record<string, unknown>)["string"]).toBe(
        "function",
      );
      expect(typeof (tag as Record<string, unknown>)["with"]).toBe("function");
      expect(typeof (tag as Record<string, unknown>)["indent"]).toBe("symbol");
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles tabs for indentation", () => {
      const result = undent.string("\n\t\tHello\n\t\tWorld\n\t");
      expect(result).toBe("Hello\nWorld");
    });

    it("handles deeply nested indentation", () => {
      const result = undent`
                deeply
                  nested
                content
      `;
      expect(result).toBe("deeply\n  nested\ncontent");
    });

    it("handles lines with only whitespace between content lines", () => {
      const result = undent`
        Hello
        ${" "}
        World
      `;
      expect(result).toBe("Hello\n \nWorld");
    });

    it("handles undefined interpolation", () => {
      const val = undefined;
      const result = undent`
        ${val}
      `;
      expect(result).toBe("undefined");
    });

    it("handles zero as interpolation", () => {
      const result = undent`
        ${0}
      `;
      expect(result).toBe("0");
    });

    it("handles object interpolation", () => {
      const result = undent`
        ${({ toString: () => "custom" })}
      `;
      expect(result).toBe("custom");
    });

    it("handles very long strings without stack overflow", () => {
      const lines = Array.from({ length: 10_000 }, (_, i) => `    line${i}`)
        .join("\n");
      const tpl = "\n" + lines + "\n";
      const result = undent.string(tpl);
      expect(result.startsWith("line0")).toBe(true);
      expect(result.includes("\nline9999")).toBe(true);
    });

    it("handles only newlines", () => {
      const result = undent.string("\n\n\n");
      expect(result).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // Indentation detection accuracy
  // -------------------------------------------------------------------------

  describe("indentation detection", () => {
    it("uses minimum indentation across all lines", () => {
      const result = undent`
        less
          more
            most
      `;
      expect(result).toBe("less\n  more\n    most");
    });

    it("ignores blank lines when detecting indent level", () => {
      const result = undent`
        Hello

        World
      `;
      expect(result).toBe("Hello\n\nWorld");
    });

    it("detects indent from first content line (strategy: first)", () => {
      const first = undent.with({ strategy: "first" });
      const result = first`
        Hello
          World
      `;
      expect(result).toBe("Hello\n  World");
    });

    it("common strategy scans all segments for minimum indent", () => {
      const a = "x";
      const result = undent`
          before ${a}
        less indented
      `;
      expect(result).toBe("  before x\nless indented");
    });
  });

  // -------------------------------------------------------------------------
  // Indent anchor
  // -------------------------------------------------------------------------

  describe("indent anchor", () => {
    it("content at anchor column becomes column 0", () => {
      const result = undent`
        ${undent.indent}
        This is column 0
          This keeps 2 spaces
      `;
      expect(result).toBe("This is column 0\n  This keeps 2 spaces");
    });

    it("content deeper than anchor preserves relative spacing", () => {
      const result = undent`
            ${undent.indent}
              Two past anchor
                Four past anchor
      `;
      expect(result).toBe("  Two past anchor\n    Four past anchor");
    });

    it("works with interpolated values after anchor", () => {
      const name = "World";
      const result = undent`
        ${undent.indent}
        Hello ${name}
        Goodbye ${name}
      `;
      expect(result).toBe("Hello World\nGoodbye World");
    });

    it("works with align() after anchor", () => {
      const items = "- a\n- b";
      const result = undent`
        ${undent.indent}
        list:
          ${align(items)}
      `;
      expect(result).toBe("list:\n  - a\n  - b");
    });

    it("accepts the tag itself as anchor (outdent compat)", () => {
      const result = undent`
        ${undent}
        Anchored via self-reference
          Indented more
      `;
      expect(result).toBe("Anchored via self-reference\n  Indented more");
    });

    it("exported indent symbol works as anchor", () => {
      const result = undent`
        ${indent}
        Using imported symbol
      `;
      expect(result).toBe("Using imported symbol");
    });

    it("is not triggered when marker is not on its own line", () => {
      const result = undent`
        value: ${undent.indent} and more
      `;
      expect(result).toBe(`value: ${String(undent.indent)} and more`);
    });

    it("works with configured instances", () => {
      const crlf = undent.with({ newline: "\r\n" });
      const result = crlf`
        ${crlf.indent}
        first
        second
      `;
      expect(result).toBe("first\r\nsecond");
    });
  });

  // -------------------------------------------------------------------------
  // Scale
  // -------------------------------------------------------------------------

  describe("scale", () => {
    it("handles templates with many interpolations", () => {
      const count = 100;
      const strings = Array.from({ length: count + 1 }, () => "\n    ");
      const raw = [...strings];
      const tsa = Object.assign(strings, {
        raw,
      }) as unknown as TemplateStringsArray;
      const vals = Array.from({ length: count }, (_, i) => String(i));
      const result = undent(tsa, ...vals);
      expect(result).toContain("0");
      expect(result).toContain("99");
    });

    it("caching remains correct under repeated calls", () => {
      function render(n: number) {
        return undent`
          item ${n}
        `;
      }
      let last = "";
      for (let i = 0; i < 10_000; i++) {
        last = render(i);
      }
      expect(last).toBe("item 9999");
    });
  });

  // -------------------------------------------------------------------------
  // align()
  // -------------------------------------------------------------------------

  describe("align()", () => {
    describe("block-style insertion", () => {
      it("pads subsequent lines to match insertion column", () => {
        const list = "- a\n- b\n- c";
        const result = undent`
          items:
            ${align(list)}
          done
        `;
        expect(result).toBe("items:\n  - a\n  - b\n  - c\ndone");
      });

      it("aligns code blocks for code generation", () => {
        const body = "if (x) {\n  go();\n}";
        const result = undent`
          function run() {
            ${align(body)}
          }
        `;
        expect(result).toBe("function run() {\n  if (x) {\n    go();\n  }\n}");
      });

      it("handles deeply nested insertion", () => {
        const val = "a\nb\nc";
        const result = undent`
          level1:
            level2:
              level3:
                ${align(val)}
        `;
        expect(result).toBe(
          "level1:\n  level2:\n    level3:\n      a\n      b\n      c",
        );
      });
    });

    describe("mid-line insertion", () => {
      it("aligns to the actual column position, not line indent", () => {
        const attrs = 'class="box"\nid="main"';
        const result = undent`
          <div ${align(attrs)}>
        `;
        expect(result).toBe('<div class="box"\n     id="main">');
      });

      it("aligns after text content on the same line", () => {
        const val = "first\nsecond\nthird";
        const result = undent`
          prefix: ${align(val)} suffix
        `;
        expect(result).toBe(
          "prefix: first\n        second\n        third suffix",
        );
      });
    });

    describe("single-line values", () => {
      it("passes through single-line values unchanged", () => {
        const result = undent`
          ${align("hello")} world
        `;
        expect(result).toBe("hello world");
      });
    });

    describe("mixed aligned and plain values", () => {
      it("only aligns wrapped values", () => {
        const multi = "a\nb";
        const plain = "x\ny";
        const result = undent`
          ${align(multi)} | ${plain}
        `;
        expect(result).toBe("a\nb | x\ny");
      });
    });

    describe("edge cases", () => {
      it("handles empty string", () => {
        const result = undent`
          before ${align("")} after
        `;
        expect(result).toBe("before  after");
      });

      it("handles value with only newlines", () => {
        const result = undent`
          before ${align("\n\n")} after
        `;
        expect(result).toBe("before \n\n after");
      });

      it("coerces non-string values", () => {
        const result = undent`
          ${align(42)}
        `;
        expect(result).toBe("42");
      });

      it("handles value with trailing newline", () => {
        const val = "first\nsecond\n";
        const result = undent`
          ${align(val)}end
        `;
        expect(result).toBe("first\nsecond\nend");
      });

      it("preserves value's internal relative indentation", () => {
        const code = "if (true) {\n  doStuff();\n}";
        const result = undent`
          body:
            ${align(code)}
        `;
        expect(result).toBe("body:\n  if (true) {\n    doStuff();\n  }");
      });
    });
  });

  // -------------------------------------------------------------------------
  // embed()
  // -------------------------------------------------------------------------

  describe("embed()", () => {
    it("strips the value's own indentation before alignment", () => {
      const sql = "    SELECT *\n    FROM users\n    WHERE active";
      const result = undent`
        query:
          ${embed(sql)}
      `;
      expect(result).toBe("query:\n  SELECT *\n  FROM users\n  WHERE active");
    });

    it("strips and aligns pre-indented code block", () => {
      const extracted = "        console.log('a');\n        console.log('b');";
      const result = undent`
        function demo() {
          ${embed(extracted)}
        }
      `;
      expect(result).toBe(
        "function demo() {\n  console.log('a');\n  console.log('b');\n}",
      );
    });

    it("preserves relative indentation within the value", () => {
      const block = "    if (x) {\n      doIt();\n    }";
      const result = undent`
        code:
          ${embed(block)}
      `;
      expect(result).toBe("code:\n  if (x) {\n    doIt();\n  }");
    });

    it("handles value with no indentation (no-op strip)", () => {
      const plain = "first\nsecond";
      const result = undent`
        ${embed(plain)}
      `;
      expect(result).toBe("first\nsecond");
    });

    it("handles value with mixed indent levels", () => {
      const yaml = "    root:\n      child: value\n    other: stuff";
      const result = undent`
        config:
          ${embed(yaml)}
      `;
      expect(result).toBe("config:\n  root:\n    child: value\n  other: stuff");
    });

    it("handles deeply indented value inserted mid-line", () => {
      const val = "      hello\n      world";
      const result = undent`
        prefix: ${embed(val)}
      `;
      expect(result).toBe("prefix: hello\n        world");
    });

    it("handles empty string", () => {
      const result = undent`
        ${embed("")}
      `;
      expect(result).toBe("");
    });

    it("handles string with only whitespace", () => {
      const result = undent`
        ${embed("    ")}
      `;
      expect(result).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // Composition patterns
  // -------------------------------------------------------------------------

  describe("composition patterns", () => {
    it("nested undent calls compose cleanly", () => {
      const inner = undent`
        if (ready) {
          go();
        }
      `;
      const outer = undent`
        function main() {
          ${align(inner)}
        }
      `;
      expect(outer).toBe(
        "function main() {\n  if (ready) {\n    go();\n  }\n}",
      );
    });

    it("embed works with nested undent output", () => {
      const inner = undent`
        line1
        line2
      `;
      const result = undent`
        before:
          ${embed(inner)}
        after
      `;
      expect(result).toBe("before:\n  line1\n  line2\nafter");
    });

    it("multiple nested levels compose", () => {
      const leaf = "doStuff();";
      const branch = undent`
        if (x) {
          ${align(leaf)}
        }
      `;
      const root = undent`
        function main() {
          ${align(branch)}
        }
      `;
      expect(root).toBe(
        "function main() {\n  if (x) {\n    doStuff();\n  }\n}",
      );
    });

    it("align + newline normalization works together", () => {
      const crlf = undent.with({ newline: "\r\n" });
      const val = "a\nb";
      const result = crlf`
        prefix:
          ${align(val)}
      `;
      expect(result).toBe("prefix:\r\n  a\n  b");
    });

    it("anchor + align compose", () => {
      const items = "- a\n- b\n- c";
      const result = undent`
        ${undent.indent}
        list:
          ${align(items)}
        done
      `;
      expect(result).toBe("list:\n  - a\n  - b\n  - c\ndone");
    });

    it("anchor + embed compose", () => {
      const sql = "    SELECT *\n    FROM users";
      const result = undent`
        ${undent.indent}
        query:
          ${embed(sql)}
      `;
      expect(result).toBe("query:\n  SELECT *\n  FROM users");
    });
  });

  // -------------------------------------------------------------------------
  // Alignment scale
  // -------------------------------------------------------------------------

  describe("alignment scale", () => {
    it("aligns large multi-line values efficiently", () => {
      const lines = Array.from({ length: 5_000 }, (_, i) => `line ${i}`).join(
        "\n",
      );
      const result = undent`
        header:
          ${align(lines)}
      `;
      const expected = "header:\n  " +
        Array.from({ length: 5_000 }, (_, i) => `line ${i}`).join("\n  ");
      expect(result).toBe(expected);
    });

    it("embed handles large pre-indented values", () => {
      const lines = Array.from({ length: 1_000 }, (_, i) => `    item ${i}`)
        .join("\n");
      const result = undent`
        list:
          ${embed(lines)}
      `;
      expect(result.startsWith("list:\n  item 0\n  item 1")).toBe(true);
      expect(result.includes("\n  item 999")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // outdent compatibility
  // -------------------------------------------------------------------------

  describe("outdent compatibility", () => {
    it("matches outdent's basic example", () => {
      const o = undent.with({ strategy: "first", trim: "one" });
      const result = o`
        Hello
          World
      `;
      expect(result).toBe("Hello\n  World");
    });

    it("matches outdent's trim behavior", () => {
      const o = undent.with({ strategy: "first", trim: "one" });
      const result = o`

        Hello

      `;
      expect(result).toBe("\nHello\n");
    });

    it("matches outdent's newline normalization", () => {
      const o = undent.with({ newline: "\r\n" });
      const result = o`
        Hello
        World
      `;
      expect(result).toBe("Hello\r\nWorld");
    });

    it("matches outdent's self-reference anchor", () => {
      const result = undent`
        ${undent}
        Anchored
          More
      `;
      expect(result).toBe("Anchored\n  More");
    });
  });

  // -------------------------------------------------------------------------
  // Exported utilities
  // -------------------------------------------------------------------------

  describe("splitLines()", () => {
    it("splits on \\n", () => {
      const { lines, seps } = splitLines("a\nb\nc");
      expect(lines).toEqual(["a", "b", "c"]);
      expect(seps).toEqual(["\n", "\n"]);
    });

    it("splits on \\r\\n", () => {
      const { lines, seps } = splitLines("a\r\nb\r\nc");
      expect(lines).toEqual(["a", "b", "c"]);
      expect(seps).toEqual(["\r\n", "\r\n"]);
    });

    it("splits on \\r", () => {
      const { lines, seps } = splitLines("a\rb\rc");
      expect(lines).toEqual(["a", "b", "c"]);
      expect(seps).toEqual(["\r", "\r"]);
    });

    it("handles mixed line endings", () => {
      const { lines, seps } = splitLines("a\nb\r\nc\rd");
      expect(lines).toEqual(["a", "b", "c", "d"]);
      expect(seps).toEqual(["\n", "\r\n", "\r"]);
    });

    it("handles empty string", () => {
      const { lines, seps } = splitLines("");
      expect(lines).toEqual([""]);
      expect(seps).toEqual([]);
    });

    it("handles no newlines", () => {
      const { lines, seps } = splitLines("hello");
      expect(lines).toEqual(["hello"]);
      expect(seps).toEqual([]);
    });

    it("roundtrips via rejoinLines", () => {
      const original = "line1\r\nline2\nline3\rline4";
      const { lines, seps } = splitLines(original);
      expect(rejoinLines(lines, seps)).toBe(original);
    });
  });

  describe("rejoinLines()", () => {
    it("joins lines with their separators", () => {
      expect(rejoinLines(["a", "b", "c"], ["\n", "\r\n"])).toBe("a\nb\r\nc");
    });

    it("handles single line (no seps)", () => {
      expect(rejoinLines(["hello"], [])).toBe("hello");
    });

    it("falls back to \\n for missing seps", () => {
      expect(rejoinLines(["a", "b"], [])).toBe("a\nb");
    });
  });

  describe("columnOffset()", () => {
    it("returns position after last \\n", () => {
      expect(columnOffset("abc\n  ")).toBe(2);
    });

    it("returns position after \\r\\n", () => {
      expect(columnOffset("abc\r\n    ")).toBe(4);
    });

    it("returns position after \\r", () => {
      expect(columnOffset("abc\r  ")).toBe(2);
    });

    it("returns full length when no newlines", () => {
      expect(columnOffset("abcdef")).toBe(6);
    });

    it("returns 0 when string ends with newline", () => {
      expect(columnOffset("abc\n")).toBe(0);
    });

    it("handles empty string", () => {
      expect(columnOffset("")).toBe(0);
    });
  });

  describe("newlineLengthAt()", () => {
    it("detects \\n", () => {
      expect(newlineLengthAt("a\nb", 1)).toBe(1);
    });

    it("detects \\r\\n", () => {
      expect(newlineLengthAt("a\r\nb", 1)).toBe(2);
    });

    it("detects lone \\r", () => {
      expect(newlineLengthAt("a\rb", 1)).toBe(1);
    });

    it("returns 0 for non-newline", () => {
      expect(newlineLengthAt("abc", 1)).toBe(0);
    });
  });

  describe("isAligned()", () => {
    it("returns true for align() results", () => {
      expect(isAligned(align("test"))).toBe(true);
    });

    it("returns true for embed() results", () => {
      expect(isAligned(embed("  test"))).toBe(true);
    });

    it("returns false for plain strings", () => {
      expect(isAligned("test")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isAligned(null)).toBe(false);
    });

    it("returns false for plain objects", () => {
      expect(isAligned({ value: "test" })).toBe(false);
    });
  });

  describe("alignText()", () => {
    it("pads subsequent lines", () => {
      expect(alignText("a\nb\nc", "  ")).toBe("a\n  b\n  c");
    });

    it("preserves blank lines (no trailing whitespace)", () => {
      expect(alignText("a\n\nc", "  ")).toBe("a\n\n  c");
    });

    it("preserves mixed newline sequences", () => {
      expect(alignText("a\r\nb\rc", "  ")).toBe("a\r\n  b\r  c");
    });

    it("returns text unchanged with empty pad", () => {
      expect(alignText("a\nb", "")).toBe("a\nb");
    });

    it("returns single-line text unchanged", () => {
      expect(alignText("hello", "    ")).toBe("hello");
    });
  });

  describe("dedentString()", () => {
    it("strips common indent from all lines", () => {
      expect(dedentString("  a\n  b\n  c")).toBe("a\nb\nc");
    });

    it("handles first-line content", () => {
      expect(dedentString("a\n  b\n  c")).toBe("a\n  b\n  c");
    });

    it("preserves relative indent", () => {
      expect(dedentString("    a\n      b\n    c")).toBe("a\n  b\nc");
    });

    it("respects trim modes", () => {
      expect(dedentString("\n  hello\n", "none", "none")).toBe("\nhello\n");
      expect(dedentString("\n  hello\n", "all", "all")).toBe("hello");
      expect(dedentString("\n\n  hello\n\n", "one", "one")).toBe("\nhello\n");
    });

    it("returns empty for empty input", () => {
      expect(dedentString("")).toBe("");
    });

    it("handles whitespace-only input", () => {
      expect(dedentString("   ")).toBe("");
    });

    it("never destroys content", () => {
      expect(dedentString("  hello\n    world\nfoo")).toBe(
        "  hello\n    world\nfoo",
      );
    });
  });

  describe("resolveOptions()", () => {
    it("returns defaults when no overrides", () => {
      const result = resolveOptions(DEFAULTS, {});
      expect(result).toEqual(DEFAULTS);
    });

    it("merges strategy", () => {
      const result = resolveOptions(DEFAULTS, { strategy: "first" });
      expect(result.strategy).toBe("first");
    });

    it("merges trim string", () => {
      const result = resolveOptions(DEFAULTS, { trim: "none" });
      expect(result.trimLeading).toBe("none");
      expect(result.trimTrailing).toBe("none");
    });

    it("merges trim object", () => {
      const result = resolveOptions(DEFAULTS, {
        trim: { leading: "one", trailing: "none" },
      });
      expect(result.trimLeading).toBe("one");
      expect(result.trimTrailing).toBe("none");
    });

    it("preserves base values for unset fields", () => {
      const base: ResolvedOptions = {
        ...DEFAULTS,
        strategy: "first",
        newline: "\r\n",
      };
      const result = resolveOptions(base, { trim: "none" });
      expect(result.strategy).toBe("first");
      expect(result.newline).toBe("\r\n");
      expect(result.trimLeading).toBe("none");
    });

    it("allows resetting newline to null", () => {
      const base: ResolvedOptions = { ...DEFAULTS, newline: "\n" };
      const result = resolveOptions(base, { newline: null });
      expect(result.newline).toBe(null);
    });

    it("throws on invalid newline value", () => {
      expect(() =>
        resolveOptions(DEFAULTS, { newline: 42 as unknown as string })
      ).toThrow();
    });
  });

  describe("DEFAULTS", () => {
    it("has expected values", () => {
      expect(DEFAULTS.strategy).toBe("common");
      expect(DEFAULTS.trimLeading).toBe("all");
      expect(DEFAULTS.trimTrailing).toBe("all");
      expect(DEFAULTS.newline).toBe(null);
      expect(DEFAULTS.alignValues).toBe(false);
    });
  });

  describe("pre-built instances", () => {
    it("dedent is same instance as undent", () => {
      expect(dedent).toBe(undent);
    });

    it("outdent uses first strategy and trim one", () => {
      const result = outdent`
        Hello
          World
      `;
      expect(result).toBe("Hello\n  World");
    });

    it("outdent trims only one blank line", () => {
      const result = outdent`

        Hello

      `;
      expect(result).toBe("\nHello\n");
    });
  });

  describe("type exports", () => {
    it("UndentOptions is usable", () => {
      const opts: UndentOptions = { strategy: "first" };
      expect(opts.strategy).toBe("first");
    });

    it("ResolvedOptions is usable", () => {
      const opts: ResolvedOptions = { ...DEFAULTS };
      expect(opts.strategy).toBe("common");
    });

    it("TrimMode is usable", () => {
      const m: TrimMode = "all";
      expect(m).toBe("all");
    });

    it("TrimSides is usable", () => {
      const t: TrimSides = { leading: "none", trailing: "all" };
      expect(t.leading).toBe("none");
    });

    it("Undent interface is usable", () => {
      const fn: Undent = undent;
      expect(typeof fn).toBe("function");
    });

    it("AlignedValue is usable", () => {
      const a: AlignedValue = align("x");
      expect(isAligned(a)).toBe(true);
    });
  });

  // =========================================================================
  // AUDIT: Property-based tests with fast-check
  // =========================================================================

  describe("property-based tests", () => {
    const NUM_RUNS = 200;

    describe("dedentString idempotence", () => {
      it("dedentString(dedentString(s)) === dedentString(s)", () => {
        fc.assert(
          fc.property(arbMultilineString, (s) => {
            const once = dedentString(s);
            const twice = dedentString(once);
            expect(twice).toBe(once);
          }),
          { numRuns: NUM_RUNS },
        );
      });

      it("idempotence holds for indented blocks", () => {
        fc.assert(
          fc.property(arbIndentedBlock, (s) => {
            const once = dedentString(s);
            const twice = dedentString(once);
            expect(twice).toBe(once);
          }),
          { numRuns: NUM_RUNS },
        );
      });
    });

    describe("undent.string() idempotence", () => {
      it("undent.string(undent.string(s)) === undent.string(s)", () => {
        fc.assert(
          fc.property(arbMultilineString, (s) => {
            const once = undent.string(s);
            const twice = undent.string(once);
            expect(twice).toBe(once);
          }),
          { numRuns: NUM_RUNS },
        );
      });
    });

    describe("splitLines / rejoinLines roundtrip", () => {
      it("rejoinLines(splitLines(s)) === s for any string", () => {
        fc.assert(
          fc.property(fc.string({ minLength: 0, maxLength: 500 }), (s) => {
            const { lines, seps } = splitLines(s);
            expect(rejoinLines(lines, seps)).toBe(s);
          }),
          { numRuns: NUM_RUNS },
        );
      });

      it("roundtrips strings with all newline types", () => {
        fc.assert(
          fc.property(arbMultilineString, (s) => {
            const { lines, seps } = splitLines(s);
            expect(rejoinLines(lines, seps)).toBe(s);
          }),
          { numRuns: NUM_RUNS },
        );
      });

      it("lines.length === seps.length + 1", () => {
        fc.assert(
          fc.property(fc.string({ minLength: 0, maxLength: 500 }), (s) => {
            const { lines, seps } = splitLines(s);
            expect(lines.length).toBe(seps.length + 1);
          }),
          { numRuns: NUM_RUNS },
        );
      });
    });

    describe("content preservation", () => {
      it("undent.string() never destroys non-whitespace characters", () => {
        fc.assert(
          fc.property(arbIndentedBlock, (s) => {
            const result = undent.string(s);
            const inputContent = contentChars(s);
            const outputContent = contentChars(result);
            expect(outputContent).toBe(inputContent);
          }),
          { numRuns: NUM_RUNS },
        );
      });

      it("dedentString() never destroys non-whitespace characters", () => {
        fc.assert(
          fc.property(arbMultilineString, (s) => {
            const result = dedentString(s);
            const inputContent = contentChars(s);
            const outputContent = contentChars(result);
            expect(outputContent).toBe(inputContent);
          }),
          { numRuns: NUM_RUNS },
        );
      });
    });

    describe("line count invariant", () => {
      it("output line count ≤ input line count (trim can reduce)", () => {
        fc.assert(
          fc.property(arbIndentedBlock, (s) => {
            if (s.length === 0) return;
            const result = undent.string(s);
            if (result.length === 0) return; // empty output is fine
            expect(lineCount(result)).toBeLessThanOrEqual(lineCount(s));
          }),
          { numRuns: NUM_RUNS },
        );
      });

      it("trim 'none' preserves line count for non-empty inputs", () => {
        const keep = undent.with({ trim: "none" });
        fc.assert(
          fc.property(arbTemplateLike, (s) => {
            const result = keep.string(s);
            // With no trimming, line count should be preserved
            expect(lineCount(result)).toBe(lineCount(s));
          }),
          { numRuns: NUM_RUNS },
        );
      });
    });

    describe("columnOffset invariants", () => {
      it("always returns >= 0", () => {
        fc.assert(
          fc.property(fc.string({ minLength: 0, maxLength: 300 }), (s) => {
            expect(columnOffset(s)).toBeGreaterThanOrEqual(0);
          }),
          { numRuns: NUM_RUNS },
        );
      });

      it("never exceeds string length", () => {
        fc.assert(
          fc.property(fc.string({ minLength: 0, maxLength: 300 }), (s) => {
            expect(columnOffset(s)).toBeLessThanOrEqual(s.length);
          }),
          { numRuns: NUM_RUNS },
        );
      });
    });

    describe("newlineLengthAt invariants", () => {
      it("always returns 0, 1, or 2", () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 200 }),
            fc.nat(),
            (s, rawI) => {
              const i = rawI % s.length;
              const len = newlineLengthAt(s, i);
              expect([0, 1, 2]).toContain(len);
            },
          ),
          { numRuns: NUM_RUNS },
        );
      });
    });

    describe("alignText invariants", () => {
      it("zero-width pad preserves text unchanged", () => {
        fc.assert(
          fc.property(arbMultilineString, (s) => {
            expect(alignText(s, "")).toBe(s);
          }),
          { numRuns: NUM_RUNS },
        );
      });

      it("first line is never padded", () => {
        fc.assert(
          fc.property(
            arbMultilineString.filter((s) => s.length > 0),
            fc.integer({ min: 1, max: 8 }).map((n) => " ".repeat(n)),
            (s, pad) => {
              const result = alignText(s, pad);
              const firstLine = splitLines(result).lines[0];
              const origFirstLine = splitLines(s).lines[0];
              expect(firstLine).toBe(origFirstLine);
            },
          ),
          { numRuns: NUM_RUNS },
        );
      });
    });

    describe("empty input stability", () => {
      it("undent.string('') always returns ''", () => {
        expect(undent.string("")).toBe("");
      });

      it("dedentString('') always returns ''", () => {
        expect(dedentString("")).toBe("");
      });
    });

    describe("cache consistency under varying interpolations", () => {
      it("same TSA with different values produces correct results", () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 20 }),
            (a, b) => {
              // These use the same template literal (same TSA identity)
              function render(val: string) {
                return undent`
                  Hello ${val}
                  World
                `;
              }
              expect(render(a)).toBe(`Hello ${a}\nWorld`);
              expect(render(b)).toBe(`Hello ${b}\nWorld`);
            },
          ),
          { numRuns: NUM_RUNS },
        );
      });
    });
  });

  // =========================================================================
  // AUDIT: Oracle / comparison tests against npm:dedent and npm:outdent
  // =========================================================================

  describe("oracle comparison tests", () => {
    describe("vs npm:dedent — basic dedenting", () => {
      it("matches dedent on simple templates", () => {
        const input = "\n    Hello\n    World\n  ";
        const ours = undent.string(input);
        // npm:dedent called as a function on a string
        const theirs = npmDedent(input);
        expect(ours).toBe(theirs);
      });

      it("matches dedent on indented content with relative indent", () => {
        const input = "\n      line1\n        indented\n      line3\n    ";
        const ours = undent.string(input);
        const theirs = npmDedent(input);
        expect(ours).toBe(theirs);
      });

      it("matches dedent on tagged template with interpolation", () => {
        const name = "World";
        const ours = undent`
          Hello ${name}
        `;
        const theirs = npmDedent`
          Hello ${name}
        `;
        expect(ours).toBe(theirs);
      });

      it("matches dedent on multi-interpolation template", () => {
        const a = "one", b = "two", c = "three";
        const ours = undent`
          ${a}
          ${b}
          ${c}
        `;
        const theirs = npmDedent`
          ${a}
          ${b}
          ${c}
        `;
        expect(ours).toBe(theirs);
      });
    });

    describe("vs npm:outdent — compatible subset", () => {
      it("matches outdent on basic template (strategy: first, trim: one)", () => {
        const compat = undent.with({ strategy: "first", trim: "one" });
        const ours = compat`
          Hello
            World
        `;
        const theirs = npmOutdent`
          Hello
            World
        `;
        expect(ours).toBe(theirs);
      });

      it("matches outdent with interpolation", () => {
        const compat = undent.with({ strategy: "first", trim: "one" });
        const name = "World";
        const ours = compat`
          Hello ${name}
        `;
        const theirs = npmOutdent`
          Hello ${name}
        `;
        expect(ours).toBe(theirs);
      });

      it("matches outdent trim behavior (preserves extra blank lines)", () => {
        const compat = undent.with({ strategy: "first", trim: "one" });
        const ours = compat`

          Hello

        `;
        const theirs = npmOutdent`

          Hello

        `;
        expect(ours).toBe(theirs);
      });

      it("matches outdent.string() on plain strings", () => {
        const compat = undent.with({ strategy: "first", trim: "one" });
        const input = "\n    Hello\n      World\n  ";
        const ours = compat.string(input);
        const theirs = npmOutdent.string(input);
        expect(ours).toBe(theirs);
      });
    });

    describe("property-based oracle: undent vs npm:dedent on generated inputs", () => {
      // undent and npm:dedent agree on uniformly-indented blocks (all lines same indent).
      // They differ on mixed-indent and trailing-whitespace edge cases.
      const arbUniformBlock: fc.Arbitrary<string> = fc.tuple(
        fc.integer({ min: 2, max: 8 }),
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 })
            .map((s) => s.replace(/[\s]/g, "x"))
            .filter((s) => s.length > 0),
          { minLength: 1, maxLength: 8 },
        ),
      ).map(([indent, lines]: [number, string[]]) => {
        const pad = " ".repeat(indent);
        const body = lines.map((l) => pad + l).join("\n");
        return "\n" + body + "\n" + " ".repeat(indent);
      });

      it("agrees with npm:dedent on uniformly-indented blocks", () => {
        fc.assert(
          fc.property(arbUniformBlock, (s: string) => {
            const ours = undent.string(s);
            const theirs = npmDedent(s);
            expect(ours).toBe(theirs);
          }),
          { numRuns: 100 },
        );
      });
    });
  });

  // =========================================================================
  // AUDIT: Boundary value tests for trim modes
  // =========================================================================

  describe("trim boundary values", () => {
    describe("trim 'one' — 0, 1, 2, 3 blank lines at each edge", () => {
      const one = undent.with({ trim: "one" });

      it("0 blank leading, 0 blank trailing", () => {
        // Content starts immediately after backtick line
        const result = one`
          Hello
        `;
        expect(result).toBe("Hello");
      });

      it("1 blank leading, 1 blank trailing", () => {
        const result = one`

          Hello

        `;
        expect(result).toBe("\nHello\n");
      });

      it("2 blank leading, 2 blank trailing", () => {
        const result = one`


          Hello


        `;
        expect(result).toBe("\n\nHello\n\n");
      });

      it("3 blank leading, 3 blank trailing", () => {
        const result = one`



          Hello



        `;
        expect(result).toBe("\n\n\nHello\n\n\n");
      });

      it("0 blank leading, 2 blank trailing", () => {
        const result = one`
          Hello


        `;
        expect(result).toBe("Hello\n\n");
      });

      it("2 blank leading, 0 blank trailing", () => {
        const result = one`


          Hello
        `;
        expect(result).toBe("\n\nHello");
      });
    });

    describe("trim 'all' — verifies all blank lines removed", () => {
      it("1 blank leading, 1 blank trailing", () => {
        const result = undent`

          Hello

        `;
        expect(result).toBe("Hello");
      });

      it("3 blank leading, 3 blank trailing", () => {
        const result = undent`



          Hello



        `;
        expect(result).toBe("Hello");
      });
    });

    describe("trim 'none' — verifies nothing removed", () => {
      const none = undent.with({ trim: "none" });

      it("1 blank leading, 1 blank trailing", () => {
        const result = none`

          Hello

        `;
        // Two newlines leading (backtick + blank), two trailing (blank + backtick)
        expect(result).toBe("\n\nHello\n\n");
      });
    });

    describe("dedentString trim boundaries", () => {
      it("trim 'one' with 0 blank leading lines", () => {
        expect(dedentString("  hello\n  world", "one", "one")).toBe(
          "hello\nworld",
        );
      });

      it("trim 'one' with 1 blank leading line", () => {
        expect(dedentString("\n  hello\n", "one", "one")).toBe("hello");
      });

      it("trim 'one' with 2 blank leading lines", () => {
        expect(dedentString("\n\n  hello\n\n", "one", "one")).toBe("\nhello\n");
      });

      it("trim 'one' with 3 blank leading lines", () => {
        expect(dedentString("\n\n\n  hello\n\n\n", "one", "one")).toBe(
          "\n\nhello\n\n",
        );
      });
    });
  });

  // =========================================================================
  // AUDIT: Cache correctness with varying interpolation values
  // =========================================================================

  describe("cache correctness", () => {
    it("same template with different values produces different correct results", () => {
      function render(name: string, count: number) {
        return undent`
          User: ${name}
          Count: ${count}
        `;
      }
      expect(render("Alice", 1)).toBe("User: Alice\nCount: 1");
      expect(render("Bob", 99)).toBe("User: Bob\nCount: 99");
      expect(render("", 0)).toBe("User: \nCount: 0");
      expect(render("Charlie", -1)).toBe("User: Charlie\nCount: -1");
    });

    it("cache doesn't bleed between aligned and non-aligned values", () => {
      function render(val: string) {
        return undent`
          prefix: ${val}
          done
        `;
      }
      expect(render("simple")).toBe("prefix: simple\ndone");
      expect(render("multi\nline")).toBe("prefix: multi\nline\ndone");
      expect(render("back to simple")).toBe("prefix: back to simple\ndone");
    });

    it("cache correctness with align wrapper on same template", () => {
      function render(val: unknown) {
        return undent`
          data:
            ${val}
        `;
      }
      // Plain value
      expect(render("hello")).toBe("data:\n  hello");
      // Aligned value — same template, different value type
      expect(render(align("a\nb"))).toBe("data:\n  a\n  b");
      // Back to plain
      expect(render("world")).toBe("data:\n  world");
    });

    it("anchored vs non-anchored calls on different templates stay independent", () => {
      const anchored = undent`
        ${undent.indent}
        Hello
      `;
      const normal = undent`
        Hello
      `;
      expect(anchored).toBe("Hello");
      expect(normal).toBe("Hello");
    });

    it("rapid alternation between cached templates", () => {
      for (let i = 0; i < 100; i++) {
        const a = undent`
          template-a: ${i}
        `;
        const b = undent`
          template-b: ${i * 2}
        `;
        expect(a).toBe(`template-a: ${i}`);
        expect(b).toBe(`template-b: ${i * 2}`);
      }
    });
  });

  // =========================================================================
  // AUDIT: Exotic interpolation values
  // =========================================================================

  describe("exotic interpolation values", () => {
    it("handles NaN", () => {
      const result = undent`
        ${NaN}
      `;
      expect(result).toBe("NaN");
    });

    it("handles Infinity", () => {
      const result = undent`
        ${Infinity}
      `;
      expect(result).toBe("Infinity");
    });

    it("handles -Infinity", () => {
      const result = undent`
        ${-Infinity}
      `;
      expect(result).toBe("-Infinity");
    });

    it("handles Symbol (via String())", () => {
      const sym = Symbol("test");
      const result = undent`
        ${sym}
      `;
      expect(result).toBe("Symbol(test)");
    });

    it("handles BigInt", () => {
      const result = undent`
        ${BigInt(9007199254740991)}
      `;
      expect(result).toBe("9007199254740991");
    });

    it("handles empty array", () => {
      const result = undent`
        ${[]}
      `;
      expect(result).toBe("");
    });

    it("handles array with values", () => {
      const result = undent`
        ${[1, 2, 3]}
      `;
      expect(result).toBe("1,2,3");
    });

    it("handles nested object with toString", () => {
      const obj = {
        toString() {
          return "custom\nwith\nnewlines";
        },
      };
      const result = undent`
        ${obj}
      `;
      expect(result).toBe("custom\nwith\nnewlines");
    });

    it("handles very long single value", () => {
      const long = "x".repeat(100_000);
      const result = undent`
        ${long}
      `;
      expect(result).toBe(long);
    });

    it("handles value containing template-syntax characters ${}", () => {
      const tricky = "before ${notAnInterp} after";
      const result = undent`
        ${tricky}
      `;
      expect(result).toBe("before ${notAnInterp} after");
    });

    it("handles value containing backticks", () => {
      const result = undent`
        ${"code: `hello`"}
      `;
      expect(result).toBe("code: `hello`");
    });

    it("handles value with null bytes", () => {
      const result = undent`
        ${"before\0after"}
      `;
      expect(result).toBe("before\0after");
    });

    it("handles value with only \\r line endings (with interpolation)", () => {
      const val = "first\rsecond\rthird";
      const result = undent`
        ${val}
      `;
      expect(result).toBe("first\rsecond\rthird");
    });
  });

  // =========================================================================
  // AUDIT: resolveOptions with all partial override combinations
  // =========================================================================

  describe("resolveOptions comprehensive coverage", () => {
    const strategies = ["common", "first"] as const;
    const trimModes: TrimMode[] = ["all", "one", "none"];
    const newlines = [null, "\n", "\r\n", " "];
    const alignValuesOpts = [true, false];

    it("every strategy option resolves correctly", () => {
      for (const strategy of strategies) {
        const result = resolveOptions(DEFAULTS, { strategy });
        expect(result.strategy).toBe(strategy);
        // Other fields unchanged
        expect(result.trimLeading).toBe(DEFAULTS.trimLeading);
        expect(result.trimTrailing).toBe(DEFAULTS.trimTrailing);
        expect(result.newline).toBe(DEFAULTS.newline);
        expect(result.alignValues).toBe(DEFAULTS.alignValues);
      }
    });

    it("every trim mode string resolves symmetrically", () => {
      for (const trim of trimModes) {
        const result = resolveOptions(DEFAULTS, { trim });
        expect(result.trimLeading).toBe(trim);
        expect(result.trimTrailing).toBe(trim);
      }
    });

    it("every trim side combination resolves correctly", () => {
      for (const leading of trimModes) {
        for (const trailing of trimModes) {
          const result = resolveOptions(DEFAULTS, {
            trim: { leading, trailing },
          });
          expect(result.trimLeading).toBe(leading);
          expect(result.trimTrailing).toBe(trailing);
        }
      }
    });

    it("partial trim object defaults missing sides to 'all'", () => {
      const leadOnly = resolveOptions(DEFAULTS, { trim: { leading: "none" } });
      expect(leadOnly.trimLeading).toBe("none");
      expect(leadOnly.trimTrailing).toBe("all");

      const trailOnly = resolveOptions(DEFAULTS, { trim: { trailing: "one" } });
      expect(trailOnly.trimLeading).toBe("all");
      expect(trailOnly.trimTrailing).toBe("one");
    });

    it("every newline option resolves correctly", () => {
      for (const newline of newlines) {
        const result = resolveOptions(DEFAULTS, { newline });
        expect(result.newline).toBe(newline);
      }
    });

    it("every alignValues option resolves correctly", () => {
      for (const alignValues of alignValuesOpts) {
        const result = resolveOptions(DEFAULTS, { alignValues });
        expect(result.alignValues).toBe(alignValues);
      }
    });

    it("multiple options set simultaneously", () => {
      const result = resolveOptions(DEFAULTS, {
        strategy: "first",
        trim: { leading: "one", trailing: "none" },
        newline: "\r\n",
        alignValues: true,
      });
      expect(result.strategy).toBe("first");
      expect(result.trimLeading).toBe("one");
      expect(result.trimTrailing).toBe("none");
      expect(result.newline).toBe("\r\n");
      expect(result.alignValues).toBe(true);
    });

    it("chained resolution preserves earlier overrides", () => {
      const step1 = resolveOptions(DEFAULTS, { strategy: "first" });
      const step2 = resolveOptions(step1, { trim: "none" });
      const step3 = resolveOptions(step2, { newline: "\r\n" });
      expect(step3.strategy).toBe("first");
      expect(step3.trimLeading).toBe("none");
      expect(step3.trimTrailing).toBe("none");
      expect(step3.newline).toBe("\r\n");
    });

    it("empty options object changes nothing", () => {
      const custom: ResolvedOptions = {
        strategy: "first",
        trimLeading: "one",
        trimTrailing: "none",
        newline: "\r\n",
        alignValues: true,
      };
      const result = resolveOptions(custom, {});
      expect(result).toEqual(custom);
    });
  });

  // =========================================================================
  // AUDIT: Mixed newlines with interpolation
  // =========================================================================

  describe("mixed newlines with interpolation", () => {
    it("handles \\r only line endings with interpolation", () => {
      const tsa = makeTSA(["\r    Hello ", "\r    World\r  "]);
      const result = undent(tsa, "dear");
      expect(result).toContain("Hello");
      expect(result).toContain("dear");
    });

    it("handles every line having different indentation characters", () => {
      const input = "  spaces\n\ttab\n  \tspaceTab\n\t  tabSpace";
      const result = undent.string(input);
      // Should not crash; content preserved
      expect(contentChars(result)).toBe(contentChars(input));
    });
  });

  // =========================================================================
  // AUDIT: createUndent with edge-case options
  // =========================================================================

  describe("createUndent edge cases", () => {
    it("works with empty options object", () => {
      const u = undent.with({});
      const result = u`
        Hello
      `;
      expect(result).toBe("Hello");
    });

    it("works with all options set", () => {
      const u = undent.with({
        strategy: "first",
        trim: { leading: "one", trailing: "one" },
        newline: "\n",
        alignValues: true,
      });
      const val = "a\nb";
      const result = u`
        prefix: ${val}
      `;
      expect(result).toBe("prefix: a\n        b");
    });

    it("chained .with() overrides are cumulative", () => {
      const u = undent
        .with({ strategy: "first" })
        .with({ trim: "none" })
        .with({ newline: "\n" });
      const result = u`
        Hello
        World
      `;
      expect(result).toBe("\nHello\nWorld\n");
    });
  });
});
