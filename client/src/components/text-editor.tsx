import { Range } from 'immutable';
import * as monaco from 'monaco-editor';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import textEditorStyles from '../../styles/components/text-editor.module.scss';

import { Draft, DraftCompilation, DraftRange } from '../draft';
import { HostDraftCompilerResult } from '../interfaces/draft';
import { LanguageName, setLanguageService } from '../language-service';
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
  autoSave: boolean;
  documentItem: DocumentItem;
  getCompilation(): Promise<HostDraftCompilerResult>;

  // autoSave: boolean;
  // compilation: DraftCompilation | null;
  // draft: Draft;
  // getCompilation(options?: { source?: string; }): Promise<DraftCompilation>;
  // save(compilation: DraftCompilation, source: string): void;
  // summary: React.ReactNode;
}

export interface TextEditorState {

}

export class TextEditor extends React.Component<TextEditorProps, TextEditorState> {
  controller = new AbortController();
  editor!: monaco.editor.IStandaloneCodeEditor;
  isModelContentChangeExternal = false;
  markerManager!: MarkerManager;
  modelChanged = false;
  outdatedCompilation = false;
  pool = new util.Pool();
  ref = React.createRef<HTMLDivElement>();
  refWidgetContainer = React.createRef<HTMLDivElement>();
  startMarkerUpdateTimeout = util.debounce(300, () => {
    this.pool.add(async () => {
      await this.markerManager.update();
    });

    // this.pool.add(async () => {
    //   await this.getCompilation();
    // });

    // let source = this.model.getValue();

    // if (this.props.autoSave) {
    //   this.props.onChangeSave(source);
    // } else {
    //   this.props.onChange(source);
    // }
  }, { signal: this.controller.signal });

  constructor(props: TextEditorProps) {
    super(props);

    this.state = {

    };
  }

  get model() {
    return this.props.documentItem.model!;
  }

  componentDidMount() {
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
      readOnly: false // !this.props.draft.writable
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

    this.controller.signal.addEventListener('abort', () => {
      this.editor.dispose();
    });


    return;

    this.model.onDidChangeContent(() => {
      if (!this.isModelContentChangeExternal) {
        this.modelChanged = true;
        this.startMarkerUpdateTimeout();

        // if (!this.props.autoSave) {
        //   this.setState({ changeTime: Date.now() });
        // }
      }

      this.isModelContentChangeExternal = false;
    });


    // Create the marker provider

    this.markerManager = new MarkerManager(this.model, {
      provideMarkers: async (token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        return compilation.analysis.diagnostics.flatMap((diagnostic) => {
          return diagnostic.ranges.map(([startIndex, endIndex]) => {
            let start = this.model.getPositionAt(startIndex);
            let end = this.model.getPositionAt(endIndex);

            return {
              startColumn: start.column,
              startLineNumber: start.lineNumber,

              endColumn: end.column,
              endLineNumber: end.lineNumber,

              message: diagnostic.message,
              severity: {
                'error': monaco.MarkerSeverity.Error,
                'warning': monaco.MarkerSeverity.Warning
              }[diagnostic.kind]
            };
          });
        });
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
          [relation.definition, ...relation.references].some((range) => getModelRangeFromDraftRange(model, range).containsPosition(position))
        );

        return (relation && {
          range: getModelRangeFromDraftRange(model, relation.definition),
          uri: model.uri
        }) ?? null;
      },
      provideFoldingRanges: async (model, context, token) => {
        if (!this.props.compilation || this.outdatedCompilation) {
          return null;
        }

        return this.props.compilation.analysis.folds.map((fold) => {
          let range = getModelRangeFromDraftRange(model, fold.range);

          return {
            kind: monaco.languages.FoldingRangeKind.Region,
            start: range.startLineNumber,
            end: range.endLineNumber
          };
        });
      },
      provideHover: async (model, position, _token) => {
        if (!this.props.compilation || this.outdatedCompilation) {
          return null;
        }

        let result = this.props.compilation.analysis.hovers
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
          [relation.definition, ...relation.references].some((range) => getModelRangeFromDraftRange(model, range).containsPosition(position))
        );

        return (relation && [relation.definition, ...relation.references].map((range) => ({
          range: getModelRangeFromDraftRange(model, range),
          uri: model.uri
        }))) ?? null;
      },
      provideRenameEdits: async (model, position, newName, token) => {
        let compilation = await this.getCompilation();

        if (token.isCancellationRequested) {
          return null;
        }

        let rename = compilation.analysis.renames.find((rename) =>
          rename.ranges.some((range) => getModelRangeFromDraftRange(model, range).containsPosition(position))
        );

        return rename
          ? {
            edits: rename.ranges.map((range) => ({
              resource: model.uri,
              textEdit: {
                range: getModelRangeFromDraftRange(model, range),
                text: newName
              },
              versionId: model.getVersionId()
            } satisfies monaco.languages.IWorkspaceTextEdit))
          }
          : null;
      },
      provideSelectionRanges: async (model, positions, token) => {
        if (!this.props.compilation || this.outdatedCompilation) {
          return null;
        }

        let modelRanges = this.props.compilation.analysis.selections.map((draftRange) => getModelRangeFromDraftRange(model, draftRange));

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
          util.findMap(rename.ranges, (range) => {
            let modelRange = getModelRangeFromDraftRange(model, range);
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
    }, { signal: this.controller.signal });
  }

  componentDidUpdate(prevProps: TextEditorProps) {
    // if (this.props.draft.revision !== prevProps.draft.revision) {
    //   let position = this.editor.getPosition();

    //   this.isModelContentChangeExternal = true;
    //   this.model.setValue(this.props.draft.item.source!);

    //   if (position) {
    //     this.editor.setPosition(position);
    //   }

    //   if (this.props.compilation === prevProps.compilation) {
    //     this.awaitingCompilationDeferred = util.defer();
    //   }
    // }

    // if (this.props.compilation !== prevProps.compilation) {
    //   this.outdatedCompilation = false;
    // }

    // if ((this.props.compilation !== prevProps.compilation) && this.awaitingCompilationDeferred) {
    //   this.awaitingCompilationDeferred.resolve();
    //   this.awaitingCompilationDeferred = null;
    // }

    // if (this.state.changeTime && (this.props.draft.lastModified! >= this.state.changeTime)) {
    //   this.setState({ changeTime: null });
    // }
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  // async getCompilation(): Promise<DraftCompilation> {
  //   let promise = this.props.getCompilation(
  //     this.modelChanged
  //       ? { source: this.model.getValue() }
  //       : {}
  //   );

  //   this.modelChanged = false;

  //   return await promise;
  // }

  undo() {
    this.editor.trigger(undefined, 'undo', undefined);
  }

  render() {
    return (
      <div className={textEditorStyles.root}>
        <div ref={this.ref} onKeyDown={!this.props.autoSave
          ? ((event) => {
            if ((event.key === 's') && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
              event.preventDefault();

              this.pool.add(async () => {
                if (this.startMarkerUpdateTimeout.isActive()) {
                  this.startMarkerUpdateTimeout.cancel();
                  await this.markerManager.update();
                }

                // let source = this.model.getValue();
                // let compilation = await this.getCompilation();
                // this.props.save(compilation, source);

                let contents = this.model.getValue();
                await this.props.documentItem.snapshot.model.write(contents);
              });
            }
          })
          : undefined} />
        {ReactDOM.createPortal((<div className="monaco-editor" ref={this.refWidgetContainer} />), document.body)}
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
