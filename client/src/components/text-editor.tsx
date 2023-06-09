import { Range } from 'immutable';
import * as monaco from 'monaco-editor';
import { DiagnosticDocumentReference, createReport } from 'pr1-shared';
import { Component, createRef } from 'react';
import { createPortal } from 'react-dom';

import textEditorStyles from '../../styles/components/text-editor.module.scss';

import { DraftRange } from '../draft';
import { HostDraftCompilerResult } from '../interfaces/draft';
import { LanguageName, SEMANTIC_TOKEN_TYPES, setLanguageService } from '../language-service';
import * as util from '../util';
import { DocumentItem } from '../views/draft';


window.MonacoEnvironment = {
	getWorkerUrl: function (_moduleId, label) {
    if (label !== 'editorWorkerService') {
      throw new Error('Invalid worker');
    }

		return new URL('./vs/editor/editor.worker.js', import.meta.url).href;
	}
};


export interface TextEditorProps {
  documentItem: DocumentItem;
  getCompilation(): Promise<HostDraftCompilerResult>;
  onCursorChange(position: monaco.Position): void;
}

export interface TextEditorState {

}

export class TextEditor extends Component<TextEditorProps, TextEditorState> {
  controller = new AbortController();
  editor!: monaco.editor.IStandaloneCodeEditor;
  markerManager!: MarkerManager;
  pool = new util.Pool();
  ref = createRef<HTMLDivElement>();
  refWidgetContainer = createRef<HTMLDivElement>();
  startMarkerUpdateTimeout = util.debounce(300, () => {
    this.pool.add(async () => {
      await this.markerManager.update();
    });
  }, { signal: this.controller.signal });

  constructor(props: TextEditorProps) {
    super(props);

    this.state = {

    };
  }

  get model() {
    return this.props.documentItem.textModel!;
  }

  async getCompilation() {
    return await this.props.getCompilation();
  }

  override componentDidMount() {
    // Initialize the editor

    this.editor = monaco.editor.create(this.ref.current!, {
      model: this.model,
      automaticLayout: true,
      // contextmenu: false,
      language: LanguageName,
      minimap: { enabled: false },
      occurrencesHighlight: false,
      renderWhitespace: 'trailing',
      scrollBeyondLastLine: true,
      selectionHighlight: false,
      suggestLineHeight: 24,
      tabSize: 2,
      // This breaks the RenameProvider.
      // overflowWidgetsDomNode: this.refWidgetContainer.current!,
      fixedOverflowWidgets: true,
      readOnly: false, // !this.props.draft.writable
      'semanticHighlighting.enabled': true
    }, {
      storageService: {
        get() {},
        getBoolean(key: string) {
          return ['expandSuggestionDocs'].includes(key);
        },
        getNumber(key: string) {},
        remove() {},
        store() {},
        onWillSaveState() {},
        onDidChangeStorage() {},
        onDidChangeValue() {}
      }
    });

    // @ts-expect-error
    this.editor._themeService._theme.getTokenStyleMetadata = (type: string, modifiers, language) => {
      if (type === 'lead') {
        return {
          underline: true
        };
      }
    };

    this.controller.signal.addEventListener('abort', () => {
      this.editor.dispose();
    });

    this.model.onDidChangeContent(() => {
      this.startMarkerUpdateTimeout();
    });


    // Watch for cursor movement

    this.editor.onDidChangeCursorPosition((event) => {
      this.props.onCursorChange(event.position);
    });


    // Create the marker provider

    this.markerManager = new MarkerManager(this.model, {
      provideMarkers: async (token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        return [
          ...createReport(compilation.analysis).flatMap(([diagnostic, kind]) => [
            ...diagnostic.references.map((reference) => ({
              message: diagnostic.message,
              reference,
              severity: {
                'error': monaco.MarkerSeverity.Error,
                'warning': monaco.MarkerSeverity.Warning
              }[kind],
              tag: null
            })),
            ...(diagnostic.trace ?? []).map((reference, index) => ({
              message: `${diagnostic.message} (${diagnostic.trace!.length - index}/${diagnostic.trace!.length})`,
              reference,
              severity: monaco.MarkerSeverity.Hint,
              tag: null
            }))
          ]),
          ...compilation.analysis.markers.map((marker) => ({
            message: marker.message,
            reference: marker.reference,
            severity: monaco.MarkerSeverity.Hint,
            tag: {
              'deprecated': monaco.MarkerTag.Deprecated,
              'unnecessary': monaco.MarkerTag.Unnecessary
            }[marker.kind]
          }))
        ]
          .filter((diagnostic) => (diagnostic.reference.type === 'document'))
          .flatMap((diagnostic) =>
            (diagnostic.reference as DiagnosticDocumentReference).ranges.map(([startIndex, endIndex]) => {
              let start = this.model.getPositionAt(startIndex);
              let end = this.model.getPositionAt(endIndex);

              return {
                startColumn: start.column,
                startLineNumber: start.lineNumber,

                endColumn: end.column,
                endLineNumber: end.lineNumber,

                message: diagnostic.message,
                severity: diagnostic.severity,
                tags: (diagnostic.tag !== null) ? [diagnostic.tag] : []
              };
            })
          );
      }
    });

    this.pool.add(async () => {
      await this.markerManager.update();
    });


    // Create the language service

    setLanguageService(this.model, {
      provideCompletionItems: async (model, position, context, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        let match = util.findMap(compilation.analysis.completions, (completion) => {
          let modelRange = util.findMap(completion.ranges, (draftRange) => {
            let modelRange = getModelRangeFromDraftRange(model, draftRange);

            return modelRange.containsPosition(position)
              ? modelRange
              : null;
          });

          return modelRange
            ? { completion, range: modelRange }
            : null;
        });

        if (!match) {
          return null;
        }

        return {
          suggestions: match.completion.items.map((item) => ({
            detail: item.signature ?? undefined,
            documentation: item.documentation ?? undefined,
            insertText: item.text,
            kind: {
              class: monaco.languages.CompletionItemKind.Class,
              constant: monaco.languages.CompletionItemKind.Constant,
              enum: monaco.languages.CompletionItemKind.Enum,
              field: monaco.languages.CompletionItemKind.Field,
              property: monaco.languages.CompletionItemKind.Property
            }[item.kind],
            label: {
              description: item.namespace ?? undefined,
              detail: (item.sublabel ? ' ' + item.sublabel : undefined),
              label: item.label
            },
            range: match!.range
          }))
        };
      },
      provideDefinition: async (model, position, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        let relation = compilation.analysis.relations.find((relation) =>
          [relation.definitionName, ...relation.references].some((reference) => {
            let range = reference.ranges[0];
            return getModelRangeFromDraftRange(model, range).containsPosition(position)
          })
        );

        return (relation && {
          range: getModelRangeFromDraftRange(model, relation.definitionBody.ranges[0]),
          uri: model.uri
        }) ?? null;
      },
      provideFoldingRanges: async (model, context, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        return compilation.analysis.folds.map((fold) => {
          let range = getModelRangeFromDraftRange(model, fold.range);

          return {
            kind: monaco.languages.FoldingRangeKind.Region,
            start: range.startLineNumber,
            end: range.endLineNumber
          };
        });
      },
      provideHover: async (model, position, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        let result = compilation.analysis.hovers
          .map((hover) => ({
            hover,
            range: getModelRangeFromDraftRange(model, hover.range)
          }))
          .find(({ range }) => range.containsPosition(position));

        return result && {
          contents: result.hover.contents.map((str) => ({ value: str })),
          range: result.range
        };
      },
      provideReferences: async (model, position, context, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        let relation = compilation.analysis.relations.find((relation) =>
          [relation.definitionName, ...relation.references].some((reference) => getModelRangeFromDraftRange(model, reference.ranges[0]).containsPosition(position))
        );

        return (relation && [relation.definitionName, ...relation.references].map((reference) => ({
          range: getModelRangeFromDraftRange(model, reference.ranges[0]),
          uri: model.uri
        }))) ?? null;
      },
      provideRenameEdits: async (model, position, newName, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        let rename = compilation.analysis.renames.find((rename) =>
          rename.items.some((item) => getModelRangeFromDraftRange(model, item.ranges[0]).containsPosition(position))
        );

        return rename
          ? {
            edits: rename.items.map((item) => ({
              resource: model.uri,
              textEdit: {
                range: getModelRangeFromDraftRange(model, item.ranges[0]),
                text: newName
              },
              versionId: model.getVersionId()
            } satisfies monaco.languages.IWorkspaceTextEdit))
          }
          : null;
      },
      provideSelectionRanges: async (model, positions, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        let modelRanges = compilation.analysis.selections.map((draftRange) => getModelRangeFromDraftRange(model, draftRange));

        return positions.map((position) =>
          modelRanges
            .filter((range) => range.containsPosition(position))
            .map((range) => ({ range }))
        );
      },
      resolveRenameLocation: async (model, position, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        let range = util.findMap(compilation.analysis.renames, (rename) =>
          util.findMap(rename.items, (item) => {
            let modelRange = getModelRangeFromDraftRange(model, item.ranges[0]);
            return modelRange.containsPosition(position)
              ? modelRange
              : null;
          })
        );

        return range
          ? {
            range,
            text: model.getValueInRange(range)
          }
          : {
            rejectReason: 'You cannot rename this element.'
          } as (monaco.languages.RenameLocation & monaco.languages.Rejection);
      },

      getLegend: () => ({
        tokenModifiers: [],
        tokenTypes: []
      }),
      provideDocumentSemanticTokens: async (model, lastResultId, token) => {
        let compilation = await this.getCompilation();
        let lastPosition = new monaco.Position(1, 0);

        let data = compilation.analysis.tokens
          .map((token) => ({
            range: token.reference.ranges[0],
            typeIndex: SEMANTIC_TOKEN_TYPES.indexOf(token.name)
          }))
          .filter(({ typeIndex }) => (typeIndex >= 0))
          .sort((a, b) => (a.range[0] - b.range[0]))
          .flatMap(({ range: [startOffset, endOffset], typeIndex }) => {
            let startPosition = this.model.getPositionAt(startOffset);
            let lineNumberDiff = (startPosition.lineNumber - lastPosition.lineNumber);

            let result = [
              lineNumberDiff,
              ((lineNumberDiff < 1)
                ? (startPosition.column - lastPosition.column)
                : startPosition.column - 1),
              (endOffset - startOffset),
              typeIndex,
              0
            ];

            lastPosition = startPosition;

            return result;
          });

        return {
          data: new Uint32Array(data)
        };
      },
      releaseDocumentSemanticTokens: (resultId) => {

      }
    }, { signal: this.controller.signal });
  }

  override componentWillUnmount() {
    this.controller.abort();
  }

  override render() {
    return (
      <div className={textEditorStyles.root} onKeyDown={(event) => {
        if ((this.editor.hasTextFocus() || event.nativeEvent.composedPath().includes(this.ref.current!)) && !event.ctrlKey && !event.metaKey) {
          event.stopPropagation();
        }
      }}>
        <div ref={this.ref} />
        {createPortal((<div className="monaco-editor" ref={this.refWidgetContainer} />), document.body)}
        {/* {this.props.summary && (
          <div className={textEditorStyles.summary}>
            {this.props.summary}
          </div>
        )} */}
      </div>
    );
  }
}


export interface MarkerProvider {
  provideMarkers: (token: monaco.CancellationToken) => monaco.languages.ProviderResult<monaco.editor.IMarkerData[]>;
}

export class MarkerManager {
  #changedLineNumbers = new Set<number>();
  #lastUnmovedLineNumber: number | null = null;
  #markers: monaco.editor.IMarkerData[] = [];
  #model: monaco.editor.IModel;
  #provider: MarkerProvider;
  #tokenSource: monaco.CancellationTokenSource | null = null;

  constructor(model: monaco.editor.IModel, provider: MarkerProvider) {
    this.#model = model;
    this.#provider = provider;

    model.onDidChangeContent((event) => {
      let lineNumbers = event.changes.flatMap((change) =>
        Range(change.range.startLineNumber, change.range.endLineNumber + 1).toArray()
      );

      for (let change of event.changes) {
        if (change.text.includes('\n') || (change.range.startLineNumber !== change.range.endLineNumber)) {
          this.#lastUnmovedLineNumber = Math.max(change.range.startLineNumber - 1, this.#lastUnmovedLineNumber ?? 0);
        }
      }

      if (this.#tokenSource) {
        this.#tokenSource.cancel();
        this.#tokenSource = null;
      }

      this.#changedLineNumbers = new Set([...this.#changedLineNumbers, ...lineNumbers]);
      this.#setMarkers();
    });

    this.#setMarkers();
  }

  #setMarkers() {
    monaco.editor.setModelMarkers(this.#model, 'main', this.#markers.filter((marker) => {
      let range = Range(marker.startLineNumber, marker.endLineNumber + 1);
      return (marker.endLineNumber <= (this.#lastUnmovedLineNumber ?? Infinity)) && !Array.from(this.#changedLineNumbers).some((lineNumber) => range.includes(lineNumber));
    }));
  }

  async update() {
    if (this.#tokenSource) {
      this.#tokenSource.cancel();
    }

    let tokenSource = new monaco.CancellationTokenSource();
    this.#tokenSource = tokenSource;

    try {
      let markers = (await this.#provider.provideMarkers(this.#tokenSource.token)) ?? [];

      if (!tokenSource.token.isCancellationRequested) {
        this.#changedLineNumbers.clear();
        this.#lastUnmovedLineNumber = null;
        this.#markers = markers;

        this.#setMarkers();
      }
    } finally {
      if (this.#tokenSource === tokenSource) {
        this.#tokenSource = null;
      }
    }
  }
}


export function getModelRangeFromDraftRange(model: monaco.editor.ITextModel, range: DraftRange): monaco.Range {
  return monaco.Range.fromPositions(
    model.getPositionAt(range[0]),
    model.getPositionAt(range[1])
  );
}
