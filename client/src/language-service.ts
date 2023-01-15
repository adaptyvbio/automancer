import * as monaco from 'monaco-editor';


export const LanguageName = 'prl';
export const ThemeName = 'prl-theme';

export type LanguageService = monaco.languages.CompletionItemProvider
  & monaco.languages.FoldingRangeProvider
  & monaco.languages.HoverProvider
  & monaco.languages.SelectionRangeProvider;


let currentLanguageService: LanguageService | null = null;

export function setLanguageService(languageService: LanguageService | null, options?: { signal?: AbortSignal; }) {
  currentLanguageService = languageService;

  options?.signal?.addEventListener('abort', () => {
    currentLanguageService = null;
  });
}

monaco.languages.register({ id: LanguageName });

monaco.languages.registerCompletionItemProvider(LanguageName, {
  provideCompletionItems: async (model, position, context, token) => (await currentLanguageService?.provideCompletionItems(model, position, context, token)) ?? null
});

monaco.languages.registerFoldingRangeProvider(LanguageName, {
  provideFoldingRanges: async (model, context, token) => (await currentLanguageService?.provideFoldingRanges(model, context, token)) ?? null
});

monaco.languages.registerHoverProvider(LanguageName, {
  provideHover: async (model, position, token) => (await currentLanguageService?.provideHover(model, position, token)) ?? null
});

monaco.languages.registerSelectionRangeProvider(LanguageName, {
  provideSelectionRanges: async (model, positions, token) => (await currentLanguageService?.provideSelectionRanges(model, positions, token)) ?? null
});

monaco.languages.setLanguageConfiguration(LanguageName, {
  autoClosingPairs: [
    { open: '{{', close: '}}' }
  ],
  brackets: [
    ['{{', '}}']
  ],
  comments: {
    lineComment: '#'
  },
  surroundingPairs: [
    { open: '{', close: '}' }
  ],
  onEnterRules: [
    { beforeText: /^ *- *[^:]+: *$/,
      action: {
        appendText: '  ',
        indentAction: monaco.languages.IndentAction.Indent
      } },
    { beforeText: /^ *[^:]+: *$/,
      action: {
        indentAction: monaco.languages.IndentAction.Indent
      } },
    { beforeText: /^ *\| .*$/,
      action: {
        appendText: '| ',
        indentAction: monaco.languages.IndentAction.None
      } }
  ]
});

monaco.languages.setMonarchTokensProvider(LanguageName, {
  tokenizer: {
    root: [
      { include: '@whitespace' },
      { include: '@comment' },

      { regex: /([^/]*\/)([^_]*)( *)(:)/, action: [{ token: 'namespace' }, { token: 'key' }, { token: 'white' }, { token: 'key', next: '@content' }] },
      { regex: /(.*)( *)(:)/, action: [{ token: 'key' }, { token: 'white' }, { token: 'string', next: '@content' }] },
    ],

    whitespace: [[/[ \t\r\n]+/, 'white']],
		comment: [[/#.*$/, 'comment']],

    content: [
      [/^/, { token: '', next: '@pop' }],
      { include: '@whitespace' },
      { include: '@comment' },
      [/[$%@]?{{/, { token: 'expr', next: '@python', nextEmbedded: 'python', bracket: '@open' }],
      [/./, 'string']
    ],

    python: [
      { include: '@whitespace' },
      [/}}/, { token: 'expr', next: '@pop', nextEmbedded: '@pop', bracket: '@close' }]
    ]
  }
});


monaco.editor.defineTheme(ThemeName, {
	base: 'vs',
	inherit: true,
	rules: [
    { token: 'comment', foreground: '6a737d' }, // grey
    { token: 'string', foreground: '032f62' }, // dark blue
    { token: 'key', foreground: '005cc5' }, // blue
    { token: 'namespace', foreground: '6f42c1' }, // purple
    { token: 'expr', foreground: 'e36209' }, // orange

    // Rules for Python
    { token: 'number', foreground: '005cc5' },
    { token: 'keyword', foreground: '005cc5' }
  ],
	colors: {
		// 'editor.foreground': '#000000',
		// 'editor.background': '#EDF9FA',
		// 'editorCursor.foreground': '#8B0000',
		// 'editor.lineHighlightBackground': '#0000FF20',
		// 'editorLineNumber.foreground': '#008800',
		// 'editor.selectionBackground': '#88000030',
		// 'editor.inactiveSelectionBackground': '#88000015'
	}
});

monaco.editor.setTheme(ThemeName);
