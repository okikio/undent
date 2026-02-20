import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import undent, {
  undent as namedUndent,
  dedent,
  outdent,
  align,
  embed,
  indent,
  isAligned,
  DEFAULTS,
  resolveOptions,
  dedentString,
  alignText,
  splitLines,
  rejoinLines,
  columnOffset,
  newlineLengthAt,
} from "./mod.ts";
import type { UndentOptions, ResolvedOptions, AlignedValue, TrimMode, TrimSides, Undent } from "./mod.ts";

// ---------------------------------------------------------------------------
// Basic behaviour
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
        const asym = undent.with({ trim: { leading: "none", trailing: "all" } });
        const result = asym`
          Hello
        `;
        expect(result).toBe("\nHello");
      });

      it("asymmetric trim — leading: all, trailing: none", () => {
        const asym = undent.with({ trim: { leading: "all", trailing: "none" } });
        const result = asym`
          Hello
        `;
        expect(result).toBe("Hello\n");
      });

      it("asymmetric trim — leading: one, trailing: none", () => {
        const asym = undent.with({ trim: { leading: "one", trailing: "none" } });
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
        // First content line has 12 spaces, "Less" has 10.
        // strategy "first" strips 12 → second line clamped.
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
        // Leading newline preserved (trim leading: none) AND normalized to \r\n.
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
        const methods = "greet() {\n  console.log('hi');\n}\n\nbye() {\n  console.log('bye');\n}";
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
      expect(typeof (tag as Record<string, unknown>)["string"]).toBe("function");
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
      const lines = Array.from({ length: 10_000 }, (_, i) => `    line${i}`).join("\n");
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
    it("sets zero-indent reference from anchor position", () => {
      const result = undent`
        ${undent.indent}
          This is column 0
            This is indented 2
      `;
      expect(result).toBe("This is column 0\n  This is indented 2");
    });

    it("works with deeper anchor indentation", () => {
      const result = undent`
            ${undent.indent}
              Anchor is deep
                Even deeper
      `;
      expect(result).toBe("Anchor is deep\n  Even deeper");
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
      const tsa = Object.assign(strings, { raw }) as unknown as TemplateStringsArray;
      const vals = Array.from({ length: count }, (_, i) => String(i));
      const result = undent(tsa, ...vals);
      expect(result).toContain("0");
      expect(result).toContain("99");
    });

    it("caching is fast on repeated calls", () => {
      function render(n: number) {
        return undent`
          item ${n}
        `;
      }
      const start = performance.now();
      for (let i = 0; i < 10_000; i++) render(i);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
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
        expect(result).toBe("level1:\n  level2:\n    level3:\n      a\n      b\n      c");
      });
    });

    describe("mid-line insertion", () => {
      it("aligns to the actual column position, not line indent", () => {
        const attrs = "class=\"box\"\nid=\"main\"";
        const result = undent`
          <div ${align(attrs)}>
        `;
        expect(result).toBe("<div class=\"box\"\n     id=\"main\">");
      });

      it("aligns after text content on the same line", () => {
        const val = "first\nsecond\nthird";
        const result = undent`
          prefix: ${align(val)} suffix
        `;
        expect(result).toBe("prefix: first\n        second\n        third suffix");
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
      expect(result).toBe("function demo() {\n  console.log('a');\n  console.log('b');\n}");
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
      expect(outer).toBe("function main() {\n  if (ready) {\n    go();\n  }\n}");
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
      expect(root).toBe("function main() {\n  if (x) {\n    doStuff();\n  }\n}");
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
      const lines = Array.from({ length: 5_000 }, (_, i) => `line ${i}`).join("\n");
      const result = undent`
        header:
          ${align(lines)}
      `;
      const expected = "header:\n  " +
        Array.from({ length: 5_000 }, (_, i) => `line ${i}`).join("\n  ");
      expect(result).toBe(expected);
    });

    it("embed handles large pre-indented values", () => {
      const lines = Array.from({ length: 1_000 }, (_, i) => `    item ${i}`).join("\n");
      const start = performance.now();
      const result = undent`
        list:
          ${embed(lines)}
      `;
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
      expect(result.startsWith("list:\n  item 0\n  item 1")).toBe(true);
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
      expect(dedentString("  hello\n    world\nfoo")).toBe("  hello\n    world\nfoo");
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
      const result = resolveOptions(DEFAULTS, { trim: { leading: "one", trailing: "none" } });
      expect(result.trimLeading).toBe("one");
      expect(result.trimTrailing).toBe("none");
    });

    it("preserves base values for unset fields", () => {
      const base: ResolvedOptions = { ...DEFAULTS, strategy: "first", newline: "\r\n" };
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
      expect(() => resolveOptions(DEFAULTS, { newline: 42 as unknown as string })).toThrow();
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
});