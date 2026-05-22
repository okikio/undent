/**
 * Verify or refresh the East Asian Width tables used by `unicode.ts`.
 *
 * Run with:
 *   deno task unicode:eaw:check
 *   deno task unicode:eaw:update
 *
 * The script treats Unicode's `EastAsianWidth.txt` as the source of truth for
 * the East Asian Width tables consumed by `unicode.ts`. Default mode only
 * checks for drift. Pass `--write` to rewrite the internal constants file in
 * place.
 *
 * The fetch path verifies more than "latest responded": it reads the version
 * from `latest/ucd/ReadMe.txt`, fetches the matching immutable versioned file,
 * and compares SHA-256 digests before trusting the payload. That keeps the
 * mutable `latest` alias honest and gives failures a concrete release anchor.
 */
import { object } from 'jsr:@optique/core/constructs';
import { runParserSync } from 'jsr:@optique/core/facade';
import { message } from 'jsr:@optique/core/message';
import { option } from 'jsr:@optique/core/primitives';
import { fromFileUrl } from 'jsr:@std/path/from-file-url';
import { parseSync } from 'npm:oxc-parser@0.132.0';

import { undent } from '../mod.ts';

import {
	EAST_ASIAN_AMBIGUOUS_RANGES,
	EAST_ASIAN_WIDE_RANGES,
} from '../_unicode_constants.ts';

type Range = readonly [start: number, end: number];

type SyncMode = 'check' | 'write';

type ParsedEastAsianWidth = {
	wideRanges: Range[];
	ambiguousRanges: Range[];
};

type DriftSummary = {
	extras: number;
	missing: number;
	extraSamples: string[];
	missingSamples: string[];
};

type VerifiedUnicodeSource = {
	version: string;
	date: string;
	text: string;
	latestSha256: string;
	versionedSha256: string;
};

type RangeConstantName =
	| 'EAST_ASIAN_WIDE_RANGES'
	| 'EAST_ASIAN_AMBIGUOUS_RANGES';

const UNICODE_HOST = 'www.unicode.org';
const LATEST_README_URL = 'https://www.unicode.org/Public/UCD/latest/ucd/ReadMe.txt';
const LATEST_EAST_ASIAN_WIDTH_URL =
	'https://www.unicode.org/Public/UCD/latest/ucd/EastAsianWidth.txt';
const UNICODE_CONSTANTS_URL = new URL('../_unicode_constants.ts', import.meta.url);
const UNICODE_CONSTANTS_PATH = fromFileUrl(UNICODE_CONSTANTS_URL);
const FETCH_TIMEOUT_MS = 30_000;
const VERSION_PATTERN = /Version\s+(\d+\.\d+\.\d+)/;
const DATE_PATTERN = /# Date:\s+([^\n]+)/;
const RANGE_CONSTANT_NAMES: readonly RangeConstantName[] = [
	'EAST_ASIAN_WIDE_RANGES',
	'EAST_ASIAN_AMBIGUOUS_RANGES',
];

const cliParser = object({
	write: option('--write', {
		description: message`Rewrite _unicode_constants.ts with the verified upstream East Asian Width ranges.`,
	}),
});

const cliArgs = runParserSync(cliParser, 'sync_unicode_east_asian_width.ts', Deno.args, {
	help: {
		option: { names: ['-h', '--help'] },
		onShow: Deno.exit,
	},
	onError: Deno.exit,
	description: message`Verify or refresh the East Asian Width tables used by unicode.ts.`,
	footer: message`Tasks: deno task unicode:eaw:check, deno task unicode:eaw:update`,
});
const mode: SyncMode = cliArgs.write ? 'write' : 'check';

await ensureRequiredPermissions(mode);

const upstream = await fetchVerifiedUnicodeSource();
const parsed = parseEastAsianWidth(upstream.text);

const wideDrift = summarizeDrift(
	expandRanges(EAST_ASIAN_WIDE_RANGES),
	expandRanges(parsed.wideRanges),
);
const ambiguousDrift = summarizeDrift(
	expandRanges(EAST_ASIAN_AMBIGUOUS_RANGES),
	expandRanges(parsed.ambiguousRanges),
);

if (mode === 'check') {
	reportDrift(upstream, wideDrift, ambiguousDrift);
	if (wideDrift.extras !== 0 || wideDrift.missing !== 0) {
		Deno.exit(1);
	}
	if (ambiguousDrift.extras !== 0 || ambiguousDrift.missing !== 0) {
		Deno.exit(1);
	}

	console.log('_unicode_constants.ts East Asian Width tables match Unicode upstream.');
	Deno.exit(0);
}

const constantsSource = await Deno.readTextFile(UNICODE_CONSTANTS_URL);
validateConstantsModule(constantsSource);
const updatedSource = renderConstantsFile(parsed);

if (updatedSource !== constantsSource) {
	await Deno.writeTextFile(UNICODE_CONSTANTS_URL, updatedSource);
	console.log(
		`Updated _unicode_constants.ts East Asian Width tables from Unicode ${upstream.version} (${upstream.versionedSha256}).`,
	);
	Deno.exit(0);
}

console.log('_unicode_constants.ts East Asian Width tables were already up to date.');

async function ensureRequiredPermissions(
	mode: SyncMode,
): Promise<void> {
	await ensurePermission(
		{ name: 'net', host: UNICODE_HOST },
		`network access to ${UNICODE_HOST}`,
	);

	if (mode === 'write') {
		await ensurePermission(
			{ name: 'read', path: UNICODE_CONSTANTS_PATH },
			`read access to ${UNICODE_CONSTANTS_PATH}`,
		);
		await ensurePermission(
			{ name: 'write', path: UNICODE_CONSTANTS_PATH },
			`write access to ${UNICODE_CONSTANTS_PATH}`,
		);
	}
}

async function ensurePermission(
	descriptor: Deno.PermissionDescriptor,
	label: string,
): Promise<void> {
	const current = await Deno.permissions.query(descriptor);
	if (current.state === 'granted') {
		return;
	}

	const requested = current.state === 'prompt'
		? await Deno.permissions.request(descriptor)
		: current;
	if (requested.state !== 'granted') {
		throw new Error(
			`This script requires ${label}. Grant the matching Deno permission and try again.`,
		);
	}
}

async function fetchVerifiedUnicodeSource(): Promise<VerifiedUnicodeSource> {
	const readmeText = await fetchText(LATEST_README_URL);
	const version = parseReadmeValue(readmeText, VERSION_PATTERN, 'Unicode version');
	const date = parseReadmeValue(readmeText, DATE_PATTERN, 'UCD date');
	const versionedUrl = `https://www.unicode.org/Public/${version}/ucd/EastAsianWidth.txt`;

	const latestBytes = await fetchBytes(LATEST_EAST_ASIAN_WIDTH_URL);
	const versionedBytes = await fetchBytes(versionedUrl);
	const latestSha256 = await sha256Hex(latestBytes);
	const versionedSha256 = await sha256Hex(versionedBytes);
	if (latestSha256 !== versionedSha256) {
		throw new Error(
			[
				'Unicode upstream integrity check failed.',
				`latest URL: ${LATEST_EAST_ASIAN_WIDTH_URL}`,
				`versioned URL: ${versionedUrl}`,
				`latest sha256: ${latestSha256}`,
				`versioned sha256: ${versionedSha256}`,
			].join('\n'),
		);
	}

	return {
		version,
		date,
		text: new TextDecoder().decode(versionedBytes),
		latestSha256,
		versionedSha256,
	};
}

function parseReadmeValue(text: string, pattern: RegExp, label: string): string {
	const match = text.match(pattern);
	if (!match?.[1]) {
		throw new Error(`Could not parse ${label} from Unicode ReadMe.txt`);
	}

	return match[1].trim();
}

async function fetchText(url: string): Promise<string> {
	return new TextDecoder().decode(await fetchBytes(url));
}

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
	const response = await fetch(url, {
		headers: {
			accept: 'text/plain; charset=utf-8',
		},
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	return new Uint8Array(arrayBuffer);
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function parseEastAsianWidth(text: string): ParsedEastAsianWidth {
	const wide: number[] = [];
	const ambiguous: number[] = [];

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*/, '').trim();
		if (line.length === 0) continue;

		const [rangePart, property] = line.split(';').map((value) => value.trim());
		if (!rangePart || !property) continue;

		const target = property === 'W' || property === 'F'
			? wide
			: property === 'A'
			? ambiguous
			: null;
		if (target === null) continue;

		const [startHex, endHex = startHex] = rangePart.split('..');
		const start = Number.parseInt(startHex, 16);
		const end = Number.parseInt(endHex, 16);
		for (let codePoint = start; codePoint <= end; codePoint++) {
			target.push(codePoint);
		}
	}

	wide.sort((left, right) => left - right);
	ambiguous.sort((left, right) => left - right);

	return {
		wideRanges: compressCodePoints(wide),
		ambiguousRanges: compressCodePoints(ambiguous),
	};
}

function compressCodePoints(codePoints: number[]): Range[] {
	if (codePoints.length === 0) return [];

	const ranges: Range[] = [];
	let start = codePoints[0]!;
	let end = start;

	for (let index = 1; index < codePoints.length; index++) {
		const codePoint = codePoints[index]!;
		if (codePoint === end + 1) {
			end = codePoint;
			continue;
		}

		ranges.push([start, end]);
		start = codePoint;
		end = codePoint;
	}

	ranges.push([start, end]);
	return ranges;
}

function expandRanges(ranges: readonly Range[]): Set<number> {
	const out = new Set<number>();
	for (const [start, end] of ranges) {
		for (let codePoint = start; codePoint <= end; codePoint++) {
			out.add(codePoint);
		}
	}

	return out;
}

function summarizeDrift(current: Set<number>, upstreamSet: Set<number>): DriftSummary {
	const extras: number[] = [];
	const missing: number[] = [];

	for (const codePoint of current) {
		if (!upstreamSet.has(codePoint)) extras.push(codePoint);
	}
	for (const codePoint of upstreamSet) {
		if (!current.has(codePoint)) missing.push(codePoint);
	}

	extras.sort((left, right) => left - right);
	missing.sort((left, right) => left - right);

	return {
		extras: extras.length,
		missing: missing.length,
		extraSamples: extras.slice(0, 10).map(formatCodePoint),
		missingSamples: missing.slice(0, 10).map(formatCodePoint),
	};
}

function formatCodePoint(codePoint: number): string {
	return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

function reportDrift(
	upstream: VerifiedUnicodeSource,
	wideDrift: DriftSummary,
	ambiguousDrift: DriftSummary,
): void {
	console.log('East Asian Width audit against Unicode upstream');
	console.log(`  source: ${LATEST_EAST_ASIAN_WIDTH_URL}`);
	console.log(`  release: Unicode ${upstream.version} (${upstream.date})`);
	console.log(`  sha256(latest): ${upstream.latestSha256}`);
	console.log(`  sha256(versioned): ${upstream.versionedSha256}`);
	console.log(renderDriftLine('wide/fullwidth', wideDrift));
	console.log(renderDriftLine('ambiguous', ambiguousDrift));

	if (wideDrift.extras !== 0 || wideDrift.missing !== 0) {
		console.log(`  wide/fullwidth extra samples: ${wideDrift.extraSamples.join(', ') || 'none'}`);
		console.log(`  wide/fullwidth missing samples: ${wideDrift.missingSamples.join(', ') || 'none'}`);
	}
	if (ambiguousDrift.extras !== 0 || ambiguousDrift.missing !== 0) {
		console.log(`  ambiguous extra samples: ${ambiguousDrift.extraSamples.join(', ') || 'none'}`);
		console.log(`  ambiguous missing samples: ${ambiguousDrift.missingSamples.join(', ') || 'none'}`);
	}
	if (
		wideDrift.extras !== 0 ||
		wideDrift.missing !== 0 ||
		ambiguousDrift.extras !== 0 ||
		ambiguousDrift.missing !== 0
	) {
		console.log('Run `deno task unicode:eaw:update` to refresh _unicode_constants.ts.');
	}
}

function renderDriftLine(label: string, drift: DriftSummary): string {
	return `  ${label}: ${drift.extras} extra, ${drift.missing} missing`;
}

function validateConstantsModule(source: string): void {
	const result = parseSync(UNICODE_CONSTANTS_PATH, source, {
		lang: 'ts',
		astType: 'ts',
		sourceType: 'module',
	});

	if (result.errors.length > 0) {
		throw new Error(
			[
				`Could not parse ${UNICODE_CONSTANTS_PATH}.`,
				formatParseError(result.errors[0]),
			].join('\n'),
		);
	}

	const found = new Set<RangeConstantName>();
	for (const statement of result.program.body) {
		const variableDeclaration = getExportedVariableDeclaration(statement);
		if (variableDeclaration === null) continue;

		for (const declaration of variableDeclaration.declarations) {
			const identifier = getIdentifierName(declaration);
			if (identifier === null || !isRangeConstantName(identifier)) continue;
			found.add(identifier);
		}
	}

	for (const name of RANGE_CONSTANT_NAMES) {
		if (!found.has(name)) {
			throw new Error(
				`${UNICODE_CONSTANTS_PATH} must export ${name} before this script can update it.`,
			);
		}
	}
}

function isRangeConstantName(value: string): value is RangeConstantName {
	return value === 'EAST_ASIAN_WIDE_RANGES' || value === 'EAST_ASIAN_AMBIGUOUS_RANGES';
}

function getExportedVariableDeclaration(statement: unknown): {
	declarations: readonly unknown[];
} | null {
	if (!isRecord(statement) || statement.type !== 'ExportNamedDeclaration') return null;
	const declaration = statement.declaration;
	if (!isRecord(declaration) || declaration.type !== 'VariableDeclaration') return null;
	if (!Array.isArray(declaration.declarations)) return null;
	return {
		declarations: declaration.declarations,
	};
}

function getIdentifierName(declaration: unknown): string | null {
	if (!isRecord(declaration)) return null;
	const id = declaration.id;
	if (!isRecord(id) || id.type !== 'Identifier') return null;
	return typeof id.name === 'string' ? id.name : null;
}

function formatParseError(error: unknown): string {
	if (!isRecord(error)) return 'Unknown parser error';
	const message = typeof error.message === 'string' ? error.message : 'Unknown parser error';
	const labels = Array.isArray(error.labels) ? error.labels : [];
	const firstLabel = labels[0];
	const loc = isRecord(firstLabel) ? firstLabel : null;
	const line = loc !== null && typeof loc.line === 'number' ? loc.line : null;
	const column = loc !== null && typeof loc.column === 'number' ? loc.column : null;
	if (line === null || column === null) return message;
	return `${line}:${column} ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function renderConstantsFile(parsed: ParsedEastAsianWidth): string {
	return [
    undent.with({ trim: { trailing: "one" }})`
      /**
       * Internal East Asian Width lookup tables generated from Unicode upstream.
       *
       * \`unicode.ts\` re-exports these tables as part of the public API, but the
       * generated data itself lives here so maintenance scripts can update one small
       * internal file instead of rewriting the public module.
       */

    `,
		renderTable('EAST_ASIAN_WIDE_RANGES', parsed.wideRanges),
		'',
		renderTable('EAST_ASIAN_AMBIGUOUS_RANGES', parsed.ambiguousRanges),
		'',
		'// End of generated East Asian Width tables.',
	].join('\n');
}

function renderTable(name: RangeConstantName, ranges: readonly Range[]): string {
	const lines = ranges.map(([start, end]) => `\t[${toHex(start)}, ${toHex(end)}],`);

	return [
		`export const ${name}: ReadonlyArray<readonly [number, number]> = [`,
		...lines,
		'];',
	].join('\n');
}

function toHex(codePoint: number): string {
	return `0x${codePoint.toString(16)}`;
}
