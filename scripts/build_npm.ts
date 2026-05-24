// deno-lint-ignore-file no-import-prefix no-unversioned-import
/**
 * Builds the npm package from the Deno source using @deno/dnt.
 *
 * Run with:
 *   deno task build:npm
 *
 * Output is written to ./npm/ and is gitignored. The directory is
 * cleared on each run so stale artifacts never bleed through.
 */
import { build, emptyDir } from "jsr:@deno/dnt";
import { format, parse } from 'jsr:@std/semver';
import denoJson from "../deno.json" with { type: "json" };

// semantic-release remains the release authority for GitHub tags and changelog
// entries, so the tagged commit still carries the pre-release deno.json
// version. npm publishing therefore takes the resolved release version from the
// workflow and injects it here, while local builds still default to deno.json.
const packageVersion = resolvePackageVersion();

await emptyDir("./npm");

await build({
  entryPoints: [
    {
      kind: "export",
      name: ".",
      path: "./mod.ts",
    },
    {
      kind: "export",
      name: "./unicode",
      path: "./unicode.ts",
    },
  ],
  outDir: "./npm",

  // mod.ts uses no Deno-specific globals (no Deno.*, no std/ imports),
  // so no shims are required.
  shims: { deno: false },

  // Type-check the output against Node.js types (the default).
  // This catches any Node vs. browser compat issues at build time.
  typeCheck: "both",

  // Do not run the test suite through Node.js. The tests import
  // jsr:@std/testing/bdd and jsr:@std/expect, which reference Deno-native
  // types (Deno.TestDefinition, Deno.TestContext, etc.) that have no Node.js
  // equivalent. Including them causes dnt to pull those Deno-specific
  // dependencies into the build graph and fail type-checking against Node
  // types. The authoritative test run happens via `deno task test` in CI,
  // which is the correct runtime for these tests.
  test: false,

  // Do not publish declaration source maps.
  // 
  // They create long generated JSON strings in `*.d.ts.map` files.
  // Socket flags those as "Long strings" because that pattern can also
  // appear in packed or obfuscated malware. For this package, the maps
  // are not needed because the npm package does not publish the original
  // `mod.ts` source next to them anyway.
  declarationMap: false,

  package: {
    name: denoJson.name, // "@okikio/undent"
    version: packageVersion,
    description:
      "Strip source-code indentation from template literals and strings. Works in Deno, Node.js, Bun, and browsers.",
    license: "MIT",
    keywords: [
      "undent",
      "dedent",
      "outdent",
      "indent",
      "template",
      "template-literal",
      "tagged-template",
    ],
    repository: {
      type: "git",
      url: "git+https://github.com/okikio/undent.git",
    },
    bugs: {
      url: "https://github.com/okikio/undent/issues",
    },
    homepage: "https://jsr.io/@okikio/undent",

    // dnt auto-generates `main`, `module`, `types`, and `exports` from the
    // declared entry points, so they are intentionally omitted here. Adding
    // them manually would create misleading dead config — dnt overwrites those
    // fields in its output pass regardless of what is specified here.

    // Tells bundlers (webpack, Rollup, esbuild, Vite, …) this package has no
    // side effects on import, enabling full tree-shaking.
    sideEffects: false,

    // Declare the minimum supported Node.js version. Node.js 18 reached EOL
    // in April 2025; targeting 20+ keeps the engines field accurate and
    // prevents installation on unsupported runtimes.
    engines: {
      node: ">=20",
    },
  },

  postBuild() {
    // Copy the non-code files that should travel with the npm package.
    Deno.copyFileSync("license", "npm/license");
    Deno.copyFileSync("readme.md", "npm/readme.md");
    Deno.copyFileSync("changelog.md", "npm/changelog.md");
  },
});

function resolvePackageVersion(): string {
  const releaseVersion = Deno.env.get('RELEASE_VERSION');

  if (!releaseVersion) {
    return denoJson.version;
  }

  const parsedVersion = parse(releaseVersion);

  if (!parsedVersion) {
    throw new Error(
      `Expected RELEASE_VERSION to be a valid semantic version, received: ${releaseVersion}`,
    );
  }

  return format(parsedVersion);
}
