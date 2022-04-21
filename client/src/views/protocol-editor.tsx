import { List, Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
import type { Chip, ChipId, ChipModel, Draft, DraftId, HostId } from '../backends/common';
import { ProtocolTimeline } from '../components/protocol-timeline';
import * as util from '../util';


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
  engagement: {
    chipId: ChipId;
  } | null;
  mode: ViewProtocolEditorMode;
  selectedHostId: HostId | null;
}

export default class ViewProtocolEditor extends React.Component<Rf.ViewProps<Model>, ViewProtocolEditorState> {
  refTextEditor = React.createRef<TextEditor>();

  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      draftId: null,
      engagement: null,
      mode: 'visual',
      selectedHostId: null
    };
  }

  get host(): Host | null {
    // return Object.values(this.props.model.hosts)[0]; // debug
    return (this.state.selectedHostId && this.props.model.hosts[this.state.selectedHostId]) || null;
  }

  get draft(): Draft | null {
    return (this.host && this.state.draftId && this.host.state.drafts[this.state.draftId]) || null;
  }

  componentDidMount() {
    // this.setState({  })
  }

  componentDidUpdate() {
    // let host = Object.values(this.props.model.hosts)[0];

    // if (host && !host.state.protocols.a) {
    //   host.backend.createProtocol('a', text);
    // }

    if (!this.state.selectedHostId && Object.keys(this.props.model.hosts).length > 0) {
      this.setState({ selectedHostId: Object.values(this.props.model.hosts)[0].id });
    }

    if (this.host && !this.state.draftId) {
      this.setState({ draftId: Object.keys(this.host.state.drafts)[0] });
    }

    if (this.draft && !this.state.engagement) {
      this.setState({ engagement: { chipId: Object.values(this.host!.state.chips)[0].id } });
    }
  }

  createDraft(source: string) {
    let draftId = crypto.randomUUID();
    this.host!.backend.createDraft(draftId, source);
    this.setState({ draftId });
  }

  render() {
    if (!this.host) {
      return <div />;
    }

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
                      { id: 'undo', name: 'Undo', shortcut: '⌘ Z', disabled: (this.state.mode !== 'text') }
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

                    case 'edit': {
                      switch (path.get(1)) {
                        case 'undo': {
                          this.refTextEditor.current!.undo();
                        }
                      }
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
                this.setState({ selectedHostId: selectedHostId as HostId });
              }} />
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          <div className="protocol-root">
            {/* style={{ border: '1px solid #f000', margin: '1rem' }}> */}
            <h2>Mitomi Main Protocol</h2>

            <div className="protocol-header">
              <span><Rf.Icon name="timeline" /></span>
              <h3>Timeline</h3>
            </div>

            <section>
              <ProtocolTimeline />
            </section>

            <div className="protocol-header">
              <span><Rf.Icon name="format-list-bulleted" /></span>
              <h3>Steps</h3>
            </div>

            <section>
          {true && <div className="proto-root">
            <div className="proto-stage-root _open">
              <a href="#" className="proto-stage-header">
                <div className="proto-stage-header-expand"><Rf.Icon name="expand-more" /></div>
                <h3 className="proto-stage-name">Preparation</h3>
              </a>
              <div className="proto-stage-steps">
                <div className="proto-step-item">
                  <div className="proto-step-header">
                    <div className="proto-step-time">13:49</div>
                    <div className="proto-step-name">Step #1</div>
                  </div>
                </div>
                <div className="proto-step-item">
                  <div className="proto-step-header">
                    <div className="proto-step-time">13:49</div>
                    <div className="proto-step-name">Step #1</div>
                  </div>
                  <div className="proto-segment-list">
                    <div className="proto-segment-features" style={{ gridRow: 1 }}>
                      <span>→</span><span>Biotin BSA</span>
                      <span>⎈</span><span>Multiplexer<sup>+</sup></span>
                      <span>⁂</span><span>Button</span>
                      <span>↬</span><span>Pump 200 µl</span>
                      <span>⌘</span><span>Confirm action</span>
                      <span>⧖</span><span>Wait 6 min</span>
                      <span>✱</span><span>Notify</span>
                    </div>
                    <button type="button" className="proto-segment-divider" style={{ gridRow: 1 }}>
                      <span></span>
                      <span>Add segment</span>
                      <span></span>
                    </button>
                    <div className="proto-segment-features" style={{ gridRow: 2 }}>
                      <span>→</span><span>Flow biotin BSA</span>
                      <span>⧖</span><span>Wait 20 min</span>
                      <span>⎈</span><span>Enable multiplexer M8<sup>+</sup></span>
                    </div>
                    <button type="button" className="proto-segment-divider" style={{ gridRow: 2 }}>
                      <span></span>
                      <span>Add segment</span>
                      <span></span>
                    </button>
                    <div className="proto-segment-features">
                      <span>→</span><span>Biotin BSA</span>
                      <span>⎈</span><span>Multiplexer<sup>+</sup></span>
                    </div>
                  </div>
                </div>
                <div className="proto-step-item">
                  <div className="proto-step-header">
                    <div className="proto-step-time">13:49</div>
                    <div className="proto-step-name">Step #1</div>
                  </div>
                  <div className="proto-segment-list">
                    <div className="proto-segment-features">
                      <span>⌘</span><span>Confirm action</span>
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
            </section>

            <div className="protocol-header">
              <span><Rf.Icon name="flag" /></span>
              <h3>Start</h3>

              {(() => {
                let chip = this.state.engagement && this.host.state.chips[this.state.engagement.chipId];
                let model = chip && this.host.state.models[chip.modelId];

                return (
                  <div>
                    <Rf.MenuSelect
                      menu={Object.values(this.host.state.chips).map((chip) => ({
                        id: chip.id,
                        name: chip.name
                      }))}
                      selectedOptionPath={chip ? [chip.id] : null}
                      onSelect={(selection) => {
                        this.setState({
                          engagement: {
                            chipId: selection.first() as ChipId
                          }
                        })
                      }} />
                  </div>
                );
              })()}
            </div>

            <section>
              <div className="protocol-config-root">
                {(() => {
                  let chip = this.state.engagement && this.host.state.chips[this.state.engagement.chipId];
                  let model = chip && this.host.state.models[chip.modelId];
                  return chip && <ControlEngagement chip={chip} draft={this.draft!} model={model!} />;
                })()}
                {(() => {
                  let chip = this.state.engagement && this.host.state.chips[this.state.engagement.chipId];
                  let model = chip && this.host.state.models[chip.modelId];
                  return chip && <ControlEngagement chip={chip} draft={this.draft!} model={model!} />;
                })()}
              </div>
              <div className="protocol-config-submit">
                <button type="button">Start</button>
              </div>
            </section>
          </div>

                    {/* <div className="proto-step-featurelist">
                      <div className="proto-step-feature">
                        <span>→</span><span>Biotin BSA</span>
                      </div>
                      <div className="proto-step-feature">
                        <span>⧖</span><span>6 min</span>
                      </div>
                    </div> */}

          {/* {this.draft && (
            this.state.mode === 'visual'
              ? <VisualEditor
                app={this.props.app}
                draft={this.draft}
                setTextMode={() => {
                  this.setState({ mode: 'text' });
                }} />
              : <TextEditor
                  draft={this.draft}
                  ref={this.refTextEditor}
                  onSave={(source) => {
                    this.host!.backend.createDraft(this.draft!.id, source);
                  }} />
          )} */}
        </Rf.ViewBody>
      </>
    );
  }
}


interface ControlEngagementProps {
  chip: Chip;
  draft: Draft;
  model: ChipModel;
}

class ControlEngagement extends React.Component<ControlEngagementProps, { arguments: List<number | null>; }> {
  constructor(props: ControlEngagementProps) {
    super(props);

    this.state = {
      arguments: List(props.draft.protocol!.data.control!.parameters.map(() => null))
    };
  }

  // get sheet(): ControlNamespace.Sheet {
  //   return this.props.model.sheets.control;
  // }

  render() {
    let protocol = this.props.draft.protocol!;
    let sheet = this.props.model.sheets.control;

    return (
      <>
        <h4>Control settings</h4>
        <div className="protocol-config-form">
          {protocol.data.control?.parameters.map((param, paramIndex) => {
            let argValveIndex = this.state.arguments.get(paramIndex) as number | null;
            let argValve = sheet.valves[argValveIndex!];

            return (
              <label className="protocol-config-entry" key={paramIndex}>
                <div>{param.label}</div>
                <Rf.MenuSelect
                  menu={sheet.groups.map((group, groupIndex) => ({
                    id: groupIndex,
                    name: group.name,
                    children: Array.from(sheet.valves.entries())
                      .filter(([_valveIndex, valve]) => groupIndex === valve.group)
                      .map(([valveIndex, valve]) => ({
                        id: valveIndex,
                        name: valve.names[0]
                      }))
                  }))}
                  onSelect={(selection) => {
                    this.setState((state) => ({ arguments: state.arguments.set(paramIndex, selection.get(1) as number) }));
                  }}
                  selectedOptionPath={argValveIndex !== null ? [argValve.group, argValveIndex] : null} />
              </label>
            );
          })}
        </div>
      </>
    );
  }
}


interface VisualEditorProps {
  app: Application;
  draft: Draft;
  setTextMode(): void;
}

interface VisualEditorState {
  openStageIndices: ImSet<number>;
}

class VisualEditor extends React.Component<VisualEditorProps, VisualEditorState> {
  constructor(props: VisualEditorProps) {
    super(props);

    this.state = {
      openStageIndices: ImSet([0, 1])
    };
  }

  render() {
    let protocol = this.props.draft.protocol;

    if (!protocol) {
      return <div className="view-blank-root">
        <div className="view-blank-container">
          <div className="view-blank-title">Invalid protocol</div>
          <button type="button" className="view-blank-action" onClick={() => {
            this.props.setTextMode();
          }}>Open code view</button>
        </div>
      </div>
    }

    return (
      <div className="proto-root">
        {protocol.stages.map((stage, stageIndex) => (
          <div className={util.formatClass('proto-stage-root', { '_open': this.state.openStageIndices.has(stageIndex) })} key={stageIndex}>
            <a href="#" className="proto-stage-header" onClick={(event) => {
              event.preventDefault();
              this.setState({ openStageIndices: util.toggleSet(this.state.openStageIndices, stageIndex) });
            }}>
              <Rf.Icon name="expand-more" />
              <h3 className="proto-stage-name">{stage.name}</h3>
              {(stage.steps.length > 0) && <div className="proto-stage-expand">⋯</div>}
            </a>
            <div className="proto-stage-steps">
              {stage.steps.map((step, stepIndex) => (
                <ContextMenuArea onContextMenu={(event) => {
                  return this.props.app.showContextMenu(event, [
                    { id: 'header', name: 'Protocol step', type: 'header' },
                    { id: 'notify', name: 'Add notification' }
                  ], (menuPath) => {

                  });
                }} key={stepIndex}>
                  <div className="proto-step-item">
                    <div className="proto-step-header">
                      <div className="proto-step-name">{step.name}</div>
                      {/* <div className="proto-step-featurelist">
                        <div className="proto-step-feature">
                          <span>→</span><span>Biotin BSA</span>
                        </div>
                        <div className="proto-step-feature">
                          <span>⧖</span><span>6 min</span>
                        </div>
                      </div> */}
                    </div>
                    <div className="proto-segment-list">
                      {new Array(step.seq[1] - step.seq[0]).fill(0).map((_, segmentRelIndex) => {
                        let segmentIndex = step.seq[0] + segmentRelIndex;
                        let segment = protocol!.segments[segmentIndex];
                        let features = [];

                        switch (segment.processNamespace) {
                          case 'input': {
                            features.push(['⌘', segment.data.input!.message]);
                            break;
                          }

                          case 'timer': {
                            features.push(['⧖', formatDuration(segment.data.timer!.duration)]);
                            break;
                          }

                          default: {
                            features.push(['⦿', 'Unknown process']);
                            break;
                          }
                        }

                        if (segment.data.control) {
                          let control = segment.data.control;

                          if (control.valves.length > 0) {
                            features.push(['→', control.valves.map((valveIndex) => protocol!.data.control!.parameters[valveIndex].label).join(', ')]);
                          }
                        }

                        return (
                          <div className="proto-segment-features" key={segmentRelIndex}>
                            {features.map(([symbol, text], featureIndex) => (
                              <React.Fragment key={featureIndex}>
                                <span>{symbol}</span>
                                <span>{text}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        );
                      })}
                      {/* <div className="proto-segment-features">
                        <span>→</span><span>Biotin BSA</span>
                        <span>⎈</span><span>Multiplexer<sup>+</sup></span>
                      </div>
                      <div className="proto-segment-features">
                        <span>→</span><span>Biotin BSA</span>
                        <span>⎈</span><span>Multiplexer<sup>+</sup></span>
                      </div> */}
                    </div>
                  </div>
                </ContextMenuArea>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
}


import * as monaco from 'monaco-editor';
import { Application } from 'retroflex';

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


type ContextMenuAreaProps = React.PropsWithChildren<{
  onContextMenu(event: MouseEvent): Promise<void>;
}>;

class ContextMenuArea extends React.Component<ContextMenuAreaProps> { // (props: React.PropsWithChildren<{}>) {
  childRef = React.createRef<HTMLElement>();

  componentDidMount() {
    let el = this.childRef.current!;

    el.addEventListener('contextmenu', (event) => {
      el.classList.add('_context');

      event.preventDefault();
      this.props.onContextMenu(event).finally(() => {
        el.classList.remove('_context');
      });
    });
  }

  render() {
    return React.cloneElement(this.props.children as React.ReactElement, {
      ref: (ref: HTMLElement) => ((this.childRef as any).current = ref)
    });
  }
}


function formatDuration(input: number): string {
  if (input < 60) {
    return `${Math.floor(input)} sec`;
  } if (input < 3600) {
    let min = Math.floor(input / 60);
    let sec = Math.floor(input % 60);
    return `${min} min` + (sec > 0 ? ` ${sec} sec` : '');
  }

  return input.toString() + ' sec';
}
