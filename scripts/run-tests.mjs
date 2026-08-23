import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outdir = mkdtempSync(join(tmpdir(), "x-clipper-tests-"));
const entryPoints = readdirSync("src")
	.filter((name) => name.endsWith(".test.ts"))
	.map((name) => join("src", name));

try {
	await build({
		entryPoints,
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node18",
		outdir,
		outExtension: { ".js": ".mjs" },
		logLevel: "silent",
	});

	const tests = readdirSync(outdir)
		.filter((name) => name.endsWith(".test.mjs"))
		.map((name) => join(outdir, name));
	const result = spawnSync(process.execPath, ["--test", ...tests], {
		stdio: "inherit",
	});
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(outdir, { recursive: true, force: true });
}
