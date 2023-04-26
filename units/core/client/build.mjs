import esbuild from 'esbuild';
import { postcssModules, sassPlugin } from 'esbuild-sass-plugin';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import externalLibraries from 'pr1/scripts/external.js';


let workingDirPath = path.dirname(fileURLToPath(import.meta.url));
let sourceDirPath = path.join(workingDirPath, 'src');

let watch = process.argv.slice(2).includes('--watch');

let context = await esbuild.context({
	entryPoints: (await fs.readdir(sourceDirPath))
		.map((relativeDirPath) => path.join(sourceDirPath, relativeDirPath, 'index.tsx')),
	absWorkingDir: workingDirPath,
	bundle: true,
	external: Object.keys(externalLibraries),
	format: 'esm',
	minify: !watch,
	outdir: 'dist',
	sourcemap: watch,
  define: { this: 'window' },
	plugins: [
		sassPlugin({
			filter: /\.module\.scss$/,
			transform: postcssModules({}),
			type: 'style'
		})
	]
});

if (watch) {
	await context.watch();
} else {
	await context.rebuild();
	await context.dispose();
}
