import { align, embed, indent, undent } from "@okikio/undent";

// · = space (shown explicitly to make indentation visible)
// 1. Core — strip structural indent, keep relative indent
// without undent
console.log(`
  Hello, world!
    indented deeper
  back to baseline
`);
//
// ··Hello,·world!
// ····indented·deeper
// ··back·to·baseline
//

// with undent
console.log(undent`
  Hello, world!
    indented deeper
  back to baseline
`);
// Hello,·world!
// ··indented·deeper
// back·to·baseline

// 2. align() — multi-line values stay at their insertion column
const items = "- alpha\n- beta\n- gamma";
// without align()
console.log(undent`
  list:
    ${items}
  end
`);
// list:
// ··- alpha
// - beta       ← snaps to column 0
// - gamma
// end

// with align()
console.log(undent`
  list:
    ${align(items)}
  end
`);
// list:
// ··- alpha
// ··- beta     ← stays at insertion column
// ··- gamma
// end

// 3. embed() — strip a value's own indent, then align it
const sql = `
    SELECT id, name
    FROM   users
    WHERE  active = true
`;
// without embed()
console.log(undent`
  query:
    ${sql}
`);
// query:
// ··
// ····SELECT·id,·name   ← baked-in indent bleeds through
// ····FROM···users
// ····WHERE··active·=·true
//

// with embed()
console.log(undent`
  query:
    ${embed(sql)}
`);
// query:
// ··SELECT·id,·name
// ··FROM···users
// ··WHERE··active·=·true

// 4. Indent anchor — explicit column-0 baseline
// without anchor — content deeper than min indent keeps its relative offset
console.log(undent`
  if (ready) {
    run();
  }
`);
// if·(ready)·{
// ··run();
// }

// with anchor — anchor column becomes column 0; content deeper than anchor keeps offset
console.log(undent`
  ${indent}
    if (ready) {
      run();
    }
`);
// ··if·(ready)·{   ← 2 cols deeper than anchor, preserved
// ····run();
// ··}

// 5. Newline fidelity — \r\n and \r pass through untouched
const crlf = "A\r\nB\r\nC";
// with undent + align — CRLF in values is never touched
console.log(JSON.stringify(undent`prefix\n${align(crlf)}`));
// "prefix\nA\r\nB\r\nC"

// 6. Trim modes — per-side, fine-grained control
// default: "all" — strips all blank wrapper lines
console.log(JSON.stringify(undent`
  hello
`));
// "hello"

// "none" — keeps blank lines at both ends
console.log(JSON.stringify(undent.with({ trim: "none" })`
  hello
`));
// "\nhello\n"

// "one" — strips at most one blank line from each end
console.log(JSON.stringify(undent.with({ trim: "one" })`
  hello
`));
// "hello"

// per-side: keep leading blank, strip trailing
console.log(
  JSON.stringify(undent.with({ trim: { leading: "none", trailing: "all" } })`
  hello
`),
);
// "\nhello"
