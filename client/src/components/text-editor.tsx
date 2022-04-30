import * as monaco from 'monaco-editor';
import * as React from 'react';

import type { Draft } from '../backends/common';


declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment | undefined;
  }
}

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


interface TextEditorProps {
  draft: Draft;
  onSave(source: string): void;
}

export class TextEditor extends React.Component<TextEditorProps> {
  editor!: monaco.editor.IStandaloneCodeEditor;
  model!: monaco.editor.IModel;
  ref = React.createRef<HTMLDivElement>();

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
      tabSize: 2
      // readOnly: true
    });

    this.model = this.editor.getModel()!;

    this.model.onDidChangeContent(() => {
      monaco.editor.setModelMarkers(this.model, 'main', []);
    });

    this.updateErrors();
  }

  componentDidUpdate() {
    this.updateErrors({ reveal: true });
  }

  updateErrors(options?: { reveal?: boolean; }) {
    monaco.editor.setModelMarkers(this.model, 'main', this.props.draft.errors.map((error) => {
      let [startIndex, endIndex] = error.range;
      let start = this.model.getPositionAt(startIndex);
      let end = this.model.getPositionAt(endIndex);

      if (options?.reveal && (this.props.draft.errors.length === 1)) {
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

  render() {
    return (
      <div ref={this.ref} style={{ height: '100%', overflow: 'hidden' }} onKeyDown={(event) => {
        if (event.metaKey && (event.key === 's')) {
          event.preventDefault();
          this.props.onSave(this.model.getValue());
        }
      }}/>
  //     <style>
  //        div.hover-row.status-bar {
  //   display: none !important;
  // }
  //     </style>
    );
  }


  undo() {
    this.editor.trigger(undefined, 'undo', undefined);
  }
}
