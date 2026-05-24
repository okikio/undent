/**
 * Syncs the semantic-release version into deno.json before the release commit.
 */
import { format, parse } from 'jsr:@std/semver';

const [version] = Deno.args;

if (!version) {
	throw new Error('Expected the next release version as the only argument.');
}

const parsedVersion = parse(version);

if (!parsedVersion) {
	throw new Error(`Expected a valid semantic version, received: ${version}`);
}

const denoJsonPath = new URL('../deno.json', import.meta.url);
const denoJsonText = await Deno.readTextFile(denoJsonPath);
const denoJson = JSON.parse(denoJsonText) as Record<string, unknown>;

denoJson.version = format(parsedVersion);

await Deno.writeTextFile(
	denoJsonPath,
	`${JSON.stringify(denoJson, null, 2)}\n`,
);