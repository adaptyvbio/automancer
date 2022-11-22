const esbuild = require('esbuild');
const { postcssModules, sassPlugin } = require('esbuild-sass-plugin');
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
	entryPoints: ['./node_modules/react', './node_modules/react-dom'],
	bundle: true,
	format: 'esm',
	minify: true,
	outdir: path.join(__dirname, 'dist/libraries')
});

esbuild.build({
	entryPoints: workerEntryPoints.map((entry) => `./node_modules/monaco-editor/esm/${entry}`),
	bundle: true,
	format: 'iife',
	minify: true,
	outbase: './node_modules/monaco-editor/esm/',
	outdir: path.join(__dirname, 'dist')
});


let plugin = {
	name: 'monaco-layer',
	setup(build) {
		build.onLoad({ filter: /node_modules\/monaco-editor\/.*\.css/ }, async (args) => {
			let text = await fs.promises.readFile(args.path, 'utf8');

			return {
				contents: `@layer monaco {\n${text}\n}`,
				loader: 'css'
			};
		});
	}
};

esbuild.build({
	entryPoints: ['src/index.tsx'],
	bundle: true,
	format: 'esm',
	outdir: path.join(__dirname, 'dist'),
  define: { this: 'window' },
	minify: !argv.watch,
	sourcemap: argv.watch,
  watch: argv.watch,
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
