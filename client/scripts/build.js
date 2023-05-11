import esbuild from 'esbuild';
import { postcssModules, sassPlugin } from 'esbuild-sass-plugin';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import externalLibraries from './external.js';


let workingDirPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let watch = process.argv.slice(2).includes('--watch');


// 1. Build external libraries

await esbuild.build({
	entryPoints: [
		'immutable',
		'scripts/libraries/react.js',
		'scripts/libraries/react-dom.js',
		'scripts/libraries/react-dom-client.js',
		'scripts/libraries/react-jsx-runtime.js'
	],
	absWorkingDir: workingDirPath,
	bundle: true,
	entryNames: '[name]',
	format: 'esm',
	minify: true,
	outdir: 'dist/libraries',
	splitting: true
});


// 2. Build monaco worker scripts

let workerEntryPoints = [
	'vs/language/json/json.worker.js',
	'vs/language/css/css.worker.js',
	'vs/language/html/html.worker.js',
	'vs/language/typescript/ts.worker.js',
	'vs/editor/editor.worker.js'
];

await esbuild.build({
	entryPoints: workerEntryPoints.map((entry) => path.join('node_modules/monaco-editor/esm', entry)),
	absWorkingDir: workingDirPath,
	bundle: true,
	format: 'iife',
	minify: true,
	outbase: 'node_modules/monaco-editor/esm',
	outdir: 'dist'
});


// 3. Build the client

let plugin = {
	name: 'monaco-layer',
	setup(build) {
		build.onLoad({ filter: /node_modules\/monaco-editor\/.*\.css/ }, async (args) => {
			let text = await fs.readFile(args.path, 'utf8');

			return {
				contents: `@layer monaco {\n${text}\n}`,
				loader: 'css'
			};
		});
	}
};

let context = await esbuild.context({
	entryPoints: ['src/index.tsx'],
	absWorkingDir: workingDirPath,
	bundle: true,
	external: Object.keys(externalLibraries),
	format: 'esm',
	minify: !watch,
	outdir: path.join(workingDirPath, 'dist'),
	sourcemap: watch,
  define: { this: 'window' },
	loader: {
		'.jpeg': 'file',
		'.ttf': 'file',
		'.woff': 'file',
		'.woff2': 'file'
	},
	plugins: [
		sassPlugin({
			filter: /\.module\.scss$/,
			transform: postcssModules({})
		}),
		sassPlugin({
			filter: /\.scss/
		}),
		plugin
	]
});

if (watch) {
	await context.watch();
} else {
	await context.rebuild();
	await context.dispose();
}
