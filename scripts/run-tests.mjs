import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outfile = join(tmpdir(), `x-clipper-article-test-${process.pid}.mjs`);

try {
	await build({
		entryPoints: ["src/article.test.ts"],
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node18",
		outfile,
		logLevel: "silent",
	});

	const result = spawnSync(process.execPath, ["--test", outfile], {
		stdio: "inherit",
	});
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(outfile, { force: true });
}
