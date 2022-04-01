const esbuild = require('esbuild');
const minimist = require('minimist');
const path = require('path');
const fs = require('fs');


let argv = minimist(process.argv.slice(2));

let workerEntryPoints = [
	'vs/language/json/json.worker.js',
	'vs/language/css/css.worker.js',
	'vs/language/html/html.worker.js',
	'vs/language/typescript/ts.worker.js',
	'vs/editor/editor.worker.js'
];

esbuild.build({
	entryPoints: workerEntryPoints.map((entry) => `./node_modules/monaco-editor/esm/${entry}`),
	bundle: true,
	format: 'iife',
	minify: true,
	outbase: './node_modules/monaco-editor/esm/',
	outdir: path.join(__dirname, 'dist')
});

esbuild.build({
	entryPoints: ['src/index.tsx'],
	bundle: true,
	format: 'iife',
	outdir: path.join(__dirname, 'dist'),
  define: { this: 'window' },
	minify: !argv.watch,
	sourcemap: argv.watch,
  watch: argv.watch,
	loader: {
		'.ttf': 'file'
	}
});
