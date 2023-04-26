import esbuild from 'esbuild';
import { postcssModules, sassPlugin } from 'esbuild-sass-plugin';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


let currentDirPath = path.dirname(fileURLToPath(import.meta.url));
let sourceDirPath = path.join(currentDirPath, 'src');

let watch = process.argv.slice(2).includes('--watch');

let ctx = await esbuild.context({
	entryPoints: (await fs.readdir(path.join(sourceDirPath)))
		.map((relativeDirPath) => path.join(sourceDirPath, relativeDirPath, 'index.tsx')),
	bundle: true,
	format: 'esm',
	external: ['pr1'],
	outdir: path.join(currentDirPath, 'dist'),
  define: { this: 'window' },
	minify: !watch,
	sourcemap: watch,
	plugins: [
		sassPlugin({
			filter: /\.module\.scss$/,
			transform: postcssModules({}),
			type: 'style'
		})
	]
});

if (watch) {
	await ctx.watch();
} else {
	await ctx.rebuild();
	await ctx.dispose();
}
