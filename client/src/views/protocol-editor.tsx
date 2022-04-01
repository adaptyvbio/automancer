import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
import type { ChipId, Draft, DraftId, HostId } from '../backends/common';


declare global {
  interface Crypto {
    randomUUID(): string;
  }
}

const DefaultSource = `name: Untitled draft
models:
  - model1
  - model2
parameters:
  - A1
  - A2
  - A3

stages:
  - name: S1
    steps:
      - duration: 1 sec
        valves: A1, A2
      - duration: 4 sec
`;


type ViewProtocolEditorMode = 'text' | 'visual';

interface ViewProtocolEditorState {
  draftId: DraftId | null;
  mode: ViewProtocolEditorMode;
  selectedHostId: HostId | null;
}

export default class ViewProtocolEditor extends React.Component<Rf.ViewProps<Model>, ViewProtocolEditorState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      mode: 'text',
      draftId: null,
      selectedHostId: null
    };
  }

  get host(): Host | null {
    return Object.values(this.props.model.hosts)[0];
    // return (this.state.selectedHostId && this.props.model.hosts[this.state.selectedHostId]) || null;
  }

  get draft(): Draft | null {
    return (this.host && this.state.draftId && this.host.state.drafts[this.state.draftId]) || null;
  }

  componentDidUpdate() {
    // let host = Object.values(this.props.model.hosts)[0];

    // if (host && !host.state.protocols.a) {
    //   host.backend.createProtocol('a', text);
    // }
  }

  createDraft(source: string) {
    let draftId = crypto.randomUUID();
    this.host!.backend.createDraft(draftId, source);
    this.setState({ draftId });
  }

  render() {
    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group">
              <Rf.MenuTabs
                menu={[
                  { id: 'file',
                    name: 'File',
                    children: [
                      { id: 'new', name: 'New' },
                      { id: 'open', name: 'Open file...' },
                      { id: 'recent', name: 'Open recent', children: [
                        { id: '_none', name: 'No recent protocols', disabled: true }
                      ] },
                      { id: 'chip', name: 'Open chip protocol', children: [
                        { id: '_none', name: 'No chip running', disabled: true }
                      ] }
                    ] },
                  { id: 'edit',
                    name: 'Edit',
                    children: [
                      { id: 'undo', name: 'Undo' }
                    ] }
                ]}
                onSelect={(path) => {
                  switch (path.get(0)) {
                    case 'file': {
                      switch (path.get(1)) {
                        case 'new': {
                          this.createDraft(DefaultSource);
                          break;
                        }

                        case 'open': {
                          let input = document.createElement('input');
                          input.setAttribute('type', 'file');

                          input.addEventListener('change', () => {
                            if (input.files) {
                              let file = input.files[0];

                              (async () => {
                                let source = await file.text();
                                this.createDraft(source);
                              })();
                            }
                          });

                          input.click();

                          break;
                        }
                      }

                      break;
                    }
                  }
                }} />
            </div>
          </div>
          <div className="toolbar-root">
            <Rf.Select
              selectedOptionPath={[this.state.mode]}
              menu={[
                { id: 'visual', name: 'Visual' },
                { id: 'text', name: 'Code' },
              ]}
              onSelect={([mode]) => {
                this.setState({ mode: mode as ViewProtocolEditorMode });
              }} />
            <Rf.Select
              selectedOptionPath={this.state.selectedHostId && [this.state.selectedHostId]}
              menu={
                Object.values(this.props.model.hosts).map((host) => ({
                  id: host.id,
                  name: host.state.info.name,
                }))
              }
              onSelect={([selectedHostId]) => {
                this.setState({ selectedHostId });
              }} />
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          {this.draft && (
            <TextEditor draft={this.draft} onSave={(source) => {
              this.host!.backend.createDraft(this.draft!.id, source);
            }} />
          )}

          {false && <div className="proto-root">
            <div className="proto-stage-root _open">
              <a href="#" className="proto-stage-header">
                <div className="proto-stage-header-expand"><Rf.Icon name="expand-more" /></div>
                <h3 className="proto-stage-name">Preparation</h3>
              </a>
              <div className="proto-stage-steps">
                <div className="proto-step-item">
                  <div className="proto-step-header">
                    <div className="proto-step-name">Step #1</div>
                    <div className="proto-step-featurelist">
                      <div className="proto-step-feature">
                        <span>→</span><span>Biotin BSA</span>
                      </div>
                      <div className="proto-step-feature">
                        <span>⧖</span><span>6 min</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="proto-step-item">
                  <div className="proto-step-header">
                    <div className="proto-step-name">Step #2</div>
                    <div className="proto-step-featurelist">
                      <div className="proto-step-feature">
                        <span>→</span><span>Biotin BSA</span>
                      </div>
                      <div className="proto-step-feature">
                        <span>↬</span><span>50 µl</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="proto-step-item">
                  <div className="proto-step-header">
                    <div className="proto-step-name">Step #1</div>
                    <div className="proto-step-process">6 min</div>
                  </div>
                  <div className="proto-control">
                    <div className="proto-control-items">
                      <span>→</span><span>Biotin BSA</span>
                      <span>⎈</span><span>Multiplexer<sup>+</sup></span>
                      <span>⁂</span><span>Button</span>
                      <span>↬</span><span>Pump 200 µl</span>
                      <span>⌘</span><span>Confirm action</span>
                      <span>⧖</span><span>Wait 6 min</span>
                      <span>✱</span><span>Notify</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="proto-stage-root">
              <div className="proto-stage-header">
                <Rf.Icon name="expand-more" />
                <h3 className="proto-stage-name">Preparation</h3>
                <a href="#" className="proto-stage-expand">⋯</a>
              </div>
            </div>
            <div className="proto-stage-root">
              <a href="#" className="proto-stage-header">
                <Rf.Icon name="expand-more" />
                <h3 className="proto-stage-name">Preparation</h3>
                <div className="proto-stage-expand">⋯</div>
              </a>
            </div>
          </div>}
        </Rf.ViewBody>
      </>
    );
  }
}


import * as monaco from 'monaco-editor';

MonacoEnvironment = {
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

class TextEditor extends React.Component<TextEditorProps> {
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

    this.model = this.editor.getModel()!; // monaco.Uri.parse('inmemory://model/1'))!;

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
}
