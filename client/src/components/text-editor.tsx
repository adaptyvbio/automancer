import * as monaco from 'monaco-editor';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Icon } from './icon';
import { Draft, DraftCompilation, DraftCompletion, DraftRange } from '../draft';
import { LanguageName, setLanguageService } from '../language-service';
import * as util from '../util';


window.MonacoEnvironment = {
	getWorkerUrl: function (_moduleId, label) {
		if (label === 'json') {
			return './dist/vs/language/json/json.worker.js';
		}
		if (label === 'css' || label === 'scss' || label === 'less') {
			return './dist/vs/language/css/css.worker.js';
		}
		if (label === 'html' || label === 'handlebars' || label === 'razor') {
			return './dist/vs/language/html/html.worker.js';
		}
		if (label === 'typescript' || label === 'javascript') {
			return './dist/vs/language/typescript/ts.worker.js';
		}
		return './dist/vs/editor/editor.worker.js';
	}
};


export interface TextEditorProps {
  autoSave: boolean;
  compilation: DraftCompilation | null;
  draft: Draft;
  onChange(source: string): void;
  onChangeSave(source: string): void;
  onSave(source: string): void;
}

export interface TextEditorState {
  changeTime: number | null;
}

export class TextEditor extends React.Component<TextEditorProps, TextEditorState> {
  compilationDeferred: util.Deferred<void> | null = null;
  controller = new AbortController();
  editor!: monaco.editor.IStandaloneCodeEditor;
  externalChange = false;
  model!: monaco.editor.IModel;
  outdatedCompilation = false;
  pool = new util.Pool();
  ref = React.createRef<HTMLDivElement>();
  refWidgetContainer = React.createRef<HTMLDivElement>();
  triggerCompilation = util.debounce(200, () => {
    let source = this.model.getValue();

    if (this.props.autoSave) {
      this.props.onChangeSave(source);
    } else {
      this.props.onChange(source);
    }
  }, { signal: this.controller.signal });

  constructor(props: TextEditorProps) {
    super(props);

    this.state = {
      changeTime: null
    };
  }

  componentDidMount() {
    this.pool.add(async () => {
      this.editor = monaco.editor.create(this.ref.current!, {
        value: this.props.draft.item.source!,
        automaticLayout: true,
        // contextmenu: false,
        language: LanguageName,
        minimap: { enabled: false },
        occurrencesHighlight: false,
        renderWhitespace: 'trailing',
        scrollBeyondLastLine: true,
        selectionHighlight: false,
        tabSize: 2,
        overflowWidgetsDomNode: this.refWidgetContainer.current!,
        fixedOverflowWidgets: true,
        readOnly: false // !this.props.draft.writable
      });

      this.model = this.editor.getModel()!;

      this.model.onDidChangeContent(() => {
        if (!this.externalChange) {
          this.triggerCompilation();

          if (!this.props.autoSave) {
            this.setState({ changeTime: Date.now() });
          }
        }

        if (!this.compilationDeferred) {
          this.compilationDeferred = util.defer();
        }

        this.outdatedCompilation = true;
        this.externalChange = false;

        this.updateMarkers();
      });

      this.updateMarkers();
    });

    function findMap<T, S>(arr: T[], fn: (item: T, index: number, arr: T[]) => S | null) : S | undefined {
      for (let [index, item] of arr.entries()) {
        let value = fn(item, index, arr);

        if (value) {
          return value;
        }
      }

      return undefined;
    }

    setLanguageService({
      provideCompletionItems: async (model, position, context, token) => {
        await this.compilationDeferred?.promise;

        if (!this.props.compilation || token.isCancellationRequested) {
          return null;
        }

        // let completion: DraftCompletion | undefined = this.props.compilation.completions.find((completion) => {
        //   return completion.ranges.some((range) => getModelRangeFromDraftRange(model, range).containsPosition(position));
        // });

        let result = findMap(this.props.compilation.completions, (completion) => {
          let modelRange = findMap(completion.ranges, (draftRange) => {
            let modelRange = getModelRangeFromDraftRange(model, draftRange);

            return modelRange.containsPosition(position)
              ? modelRange
              : null;
          });

          return modelRange
            ? { completion, range: modelRange }
            : null;
        });

        if (!result) {
          return null;
        }

        console.log('>', result);

        return {
          suggestions: result.completion.items.map((item) => ({
            kind: {
              constant: monaco.languages.CompletionItemKind.Constant,
              property: monaco.languages.CompletionItemKind.Property
            }[item.kind],
            label: {
              description: 'hello very very very long\nhelo helol hello',
              detail: ' Built-in hello very very very long\nhelo helol hello',
              label: item.label
            },
            insertText: item.text,
            range: result!.range
          }))
        };
      },
      provideFoldingRanges: async (model, context, token) => {
        if (!this.props.compilation || this.outdatedCompilation) {
          return null;
        }

        return this.props.compilation.folds.map((fold) => {
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

        let result = this.props.compilation.hovers
          .map((hover) => ({
            hover,
            range: getModelRangeFromDraftRange(model, hover.range)
          }))
          .find(({ range }) => range.containsPosition(position));

        return result && {
          contents: result.hover.contents.map((str) => ({ value: str })),
          range: result.range
        };
      }
    }, { signal: this.controller.signal });
  }

  componentDidUpdate(prevProps: TextEditorProps) {
    if (this.props.draft.revision !== prevProps.draft.revision) {
      let position = this.editor.getPosition();

      this.externalChange = true;
      this.model.setValue(this.props.draft.item.source!);

      if (position) {
        this.editor.setPosition(position);
      }
    }

    if (this.props.compilation !== prevProps.compilation) {
      console.log('INFO', this.props.compilation?.completions?.[0]);

      this.outdatedCompilation = false;
      this.updateMarkers();

      this.compilationDeferred?.resolve();
      this.compilationDeferred = null;
    }

    if (this.state.changeTime && (this.props.draft.lastModified! >= this.state.changeTime)) {
      this.setState({ changeTime: null });
    }
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  updateMarkers() {
    let compilation = this.props.compilation;

    if (compilation && !this.outdatedCompilation) {
      monaco.editor.setModelMarkers(this.model, 'main', compilation.diagnostics.flatMap((diagnostic) => {
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
      }));
    } else {
      monaco.editor.setModelMarkers(this.model, 'main', []);
    }
  }

  undo() {
    this.editor.trigger(undefined, 'undo', undefined);
  }

  render() {
    return (
      <div className="teditor-outer">
        <div className="teditor-inner">
          <div ref={this.ref} onKeyDown={!this.props.autoSave
            ? ((event) => {
              if ((event.key === 's') && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();

                if (this.triggerCompilation.isActive()) {
                  this.triggerCompilation.cancel();
                  this.props.onChangeSave(this.model.getValue());
                } else {
                  this.props.onSave(this.model.getValue());
                }
              }
            })
            : undefined} />
          {ReactDOM.createPortal((<div className="monaco-editor" ref={this.refWidgetContainer} />), document.body)}
        </div>
        {((this.props.compilation?.diagnostics.length ?? 0) > 0) && <div className="teditor-views-root">
          <div className="teditor-views-nav-root">
            <nav className="teditor-views-nav-list">
              <button className="teditor-views-nav-entry _selected">Problems</button>
            </nav>
          </div>
          <div className="teditor-views-problem-list">
            {this.props.compilation?.diagnostics.map((diagnostic, index) => (
              <button type="button" className="teditor-views-problem-entry" key={index} onClick={() => {
                if (this.props.compilation?.diagnostics.length === 1) {
                  this.editor.trigger('anystring', 'editor.action.marker.next', {});
                }
              }}>
                <Icon name={{ 'error': 'error', 'warning': 'warning' }[diagnostic.kind]} />
                <div className="teditor-views-problem-label">{diagnostic.message}</div>
              </button>
            ))}
          </div>
        </div>}
        <div className="teditor-infobar-root">
          <div className="teditor-infobar-list">
            <div className="teditor-infobar-item">{this.state.changeTime ? 'Not saved' : 'Saved'}</div>
          </div>
          <div className="teditor-infobar-list">
            {this.props.draft.lastModified && (
              <div className="teditor-infobar-item">Last saved: {new Date(this.props.draft.lastModified).toLocaleTimeString()}</div>
            )}
          </div>
        </div>
      </div>
    );
  }
}


export function getModelRangeFromDraftRange(model: monaco.editor.ITextModel, range: DraftRange): monaco.Range {
  return monaco.Range.fromPositions(
    model.getPositionAt(range[0]),
    model.getPositionAt(range[1])
  );
}
