import * as monaco from 'monaco-editor';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import type { Draft } from '../application';
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
  draft: Draft;
  onSave(source: string): void;
}

export class TextEditor extends React.Component<TextEditorProps> {
  controller = new AbortController();
  editor!: monaco.editor.IStandaloneCodeEditor;
  model!: monaco.editor.IModel;
  ref = React.createRef<HTMLDivElement>();
  refWidgetContainer = React.createRef<HTMLDivElement>();
  triggerCompilation = util.debounce(400, () => {
    // TODO: compile without saving
    this.props.onSave(this.model.getValue());
  }, { signal: this.controller.signal });

  componentDidMount() {
    this.editor = monaco.editor.create(this.ref.current!, {
      value: this.props.draft.source,
      automaticLayout: true,
      contextmenu: false,
      language: 'yaml',
      minimap: { enabled: false },
      occurrencesHighlight: false,
      renderWhitespace: 'trailing',
      scrollBeyondLastLine: false,
      selectionHighlight: false,
      tabSize: 2,
      overflowWidgetsDomNode: this.refWidgetContainer.current!,
      fixedOverflowWidgets: true
      // readOnly: true
    });

    this.model = this.editor.getModel()!;

    this.model.onDidChangeContent(() => {
      monaco.editor.setModelMarkers(this.model, 'main', []);
      this.triggerCompilation();
    });

    this.updateErrors();
  }

  componentDidUpdate() {
    this.updateErrors({ reveal: true });
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  updateErrors(options?: { reveal?: boolean; }) {
    let compiled = this.props.draft.compiled;

    if (compiled) {
      monaco.editor.setModelMarkers(this.model, 'main', compiled.errors.map((error) => {
        // TODO: show error somewhere else
        let [startIndex, endIndex] = error.range ?? [0, this.model.getValueLength()];
        let start = this.model.getPositionAt(startIndex);
        let end = this.model.getPositionAt(endIndex);

        if (options?.reveal && (compiled!.errors.length === 1)) {
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
    }
  }

  undo() {
    this.editor.trigger(undefined, 'undo', undefined);
  }

  render() {
    return (
      <div className="teditor-inner">
        <div ref={this.ref} onKeyDown={(event) => {
          if (event.metaKey && (event.key === 's')) {
            event.preventDefault();
            this.props.onSave(this.model.getValue());
          }
        }}/>
        {ReactDOM.createPortal((<div className="monaco-editor" ref={this.refWidgetContainer} />), document.body)}
      </div>
    );
  }
}
