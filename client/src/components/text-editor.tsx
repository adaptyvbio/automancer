import * as monaco from 'monaco-editor';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Icon } from './icon';
import { Draft, DraftCompilation } from '../draft';
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
  controller = new AbortController();
  editor!: monaco.editor.IStandaloneCodeEditor;
  externalChange = false;
  model!: monaco.editor.IModel;
  outdatedCompilation = false;
  pool = new util.Pool();
  ref = React.createRef<HTMLDivElement>();
  refWidgetContainer = React.createRef<HTMLDivElement>();
  triggerCompilation = util.debounce(400, () => {
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
        value: await this.getSource(),
        automaticLayout: true,
        // contextmenu: false,
        language: 'yaml',
        minimap: { enabled: false },
        occurrencesHighlight: false,
        renderWhitespace: 'trailing',
        scrollBeyondLastLine: false,
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

        this.outdatedCompilation = true;
        this.externalChange = false;

        this.updateMarkers();
      });

      this.updateMarkers();
    });
  }

  componentDidUpdate(prevProps: TextEditorProps) {
    if (this.props.draft.revision !== prevProps.draft.revision) {
      this.pool.add(async () => {
        let position = this.editor.getPosition();

        this.externalChange = true;
        this.model.setValue(await this.getSource());

        if (position) {
          this.editor.setPosition(position);
        }
      });
    }

    if (this.props.compilation !== prevProps.compilation) {
      this.outdatedCompilation = false;
      this.updateMarkers();
    }

    if (this.state.changeTime && (this.props.draft.lastModified! >= this.state.changeTime)) {
      this.setState({ changeTime: null });
    }
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  async getSource() {
    let draftItem = this.props.draft.item;
    let files = (await draftItem.getFiles())!;
    let blob = files[draftItem.mainFilePath];

    return await blob.text();
  }

  updateMarkers(options?: { reveal?: boolean; }) {
    let compilation = this.props.compilation;
    console.log('[TX] Update', compilation, this.outdatedCompilation)

    if (compilation && !this.outdatedCompilation) {
      monaco.editor.setModelMarkers(this.model, 'main', compilation.errors.map((error) => {
        let [startIndex, endIndex] = error.range ?? [0, this.model.getValueLength()];
        let start = this.model.getPositionAt(startIndex);
        let end = this.model.getPositionAt(endIndex);

        if (options?.reveal && (compilation!.errors.length === 1)) {
          this.editor.revealLines(start.lineNumber, end.lineNumber);
        }

        return {
          startColumn: start.column,
          startLineNumber: start.lineNumber,

          endColumn: end.column,
          endLineNumber: end.lineNumber,

          message: error.message,
          severity: monaco.MarkerSeverity.Error
        };
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
        {((this.props.compilation?.errors.length ?? 0) > 0) && <div className="teditor-views-root">
          <div className="teditor-views-nav-root">
            <nav className="teditor-views-nav-list">
              <button className="teditor-views-nav-entry _selected">Problems</button>
            </nav>
          </div>
          <div className="teditor-views-problem-list">
            {this.props.compilation?.errors.map((error, index) => (
              <button type="button" className="teditor-views-problem-entry" key={index} onClick={() => {
                if (this.props.compilation?.errors.length === 1) {
                  this.editor.trigger('anystring', 'editor.action.marker.next', {});
                }
              }}>
                <Icon name="error" />
                <div className="teditor-views-problem-label">{error.message}</div>
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
