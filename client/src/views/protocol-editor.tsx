import { Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
import type { Chip, ChipId, ChipModel, ControlNamespace, Draft, DraftId, HostId, Protocol } from '../backends/common';
import { ProtocolOverview } from '../components/protocol-overview';
import { ProtocolTimeline } from '../components/protocol-timeline';
import { TextEditor } from '../components/text-editor';
import Units, { UnitsCode } from '../units';


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

interface PlanData {
  chipId: ChipId;
  data: UnitsCode;
}


type ViewProtocolEditorMode = 'text' | 'visual';

interface ViewProtocolEditorState {
  draftId: DraftId | null;
  mode: ViewProtocolEditorMode;
  planData: PlanData | null;
  selectedHostId: HostId | null;
}

export default class ViewProtocolEditor extends React.Component<Rf.ViewProps<Model>, ViewProtocolEditorState> {
  refTextEditor = React.createRef<TextEditor>();

  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      draftId: null,
      mode: 'visual',
      planData: null,
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

  componentDidUpdate() {
    if (!this.state.selectedHostId && Object.keys(this.props.model.hosts).length > 0) {
      this.setState({ selectedHostId: Object.values(this.props.model.hosts)[0].id });
    }

    if (this.host && !this.state.draftId && Object.keys(this.host?.state.drafts).length > 0) {
      this.setState({ draftId: Object.keys(this.host.state.drafts)[0] });
    }

    // if (this.draft && !this.state.planData) {
    //   this.setState({ planData: {
    //     data: { control: { arguments: new Array(10).fill(null) } },
    //     chipId: Object.values(this.host!.state.chips)[0].id }
    //   });
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
            {this.host && (
              <div className="toolbar-group">
                <Rf.MenuTabs
                  menu={[
                    { id: 'file',
                      name: 'File',
                      children: [
                        { id: 'new', name: 'New', icon: 'note-add' },
                        { id: 'divider', type: 'divider' },
                        { id: 'open', name: 'Open file...', icon: 'folder' },
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
                        { id: 'undo', name: 'Undo', icon: 'undo', shortcut: '⌘ Z', disabled: (!this.draft || (this.state.mode !== 'text')) }
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
            )}
          </div>
          <div className="toolbar-root">
            {this.draft && (
              <Rf.Select
                selectedOptionPath={[this.state.mode]}
                menu={[
                  { id: 'visual', name: 'Visual', icon: 'wysiwyg' },
                  { id: 'text', name: 'Code', icon: 'code' }
                ]}
                onSelect={([mode]) => {
                  this.setState({ mode: mode as ViewProtocolEditorMode });
                }} />
            )}
            <Rf.Select
              selectedOptionPath={this.state.selectedHostId && [this.state.selectedHostId]}
              menu={[
                { id: '_header', name: 'Hosts', type: 'header' },
                ...Object.values(this.props.model.hosts).map((host) => ({
                  id: host.id,
                  name: host.state.info.name,
                  icon: 'storage'
                })),
                { id: '_divider', type: 'divider' },
                { id: 'manage', name: 'Manage hosts' }
              ]}
              onSelect={([selectedHostId]) => {
                this.setState({ selectedHostId: selectedHostId as HostId });
              }} />
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          {this.host
            ? (
              this.draft
                ? (
                  this.state.mode === 'visual'
                    ? <VisualEditor
                      app={this.props.app}
                      draft={this.draft}
                      host={this.host}
                      planData={this.state.planData}
                      setPlanData={(planData) => {
                        this.setState({ planData });
                      }}
                      setTextMode={() => {
                        this.setState({ mode: 'text' });
                      }} />
                    : <TextEditor
                        draft={this.draft}
                        ref={this.refTextEditor}
                        onSave={(source) => {
                          this.host!.backend.createDraft(this.draft!.id, source);
                        }} />
                ) : (
                  <div className="view-blank-root">
                    <div className="view-blank-container">
                      <div className="view-blank-title">No protocol selected</div>
                      <button type="button" className="view-blank-action" onClick={() => {
                        this.createDraft(DefaultSource);
                      }}>New blank protocol</button>
                    </div>
                  </div>
                )
            ) : (
              <div className="view-blank-root">
                <div className="view-blank-container">
                  <div className="view-blank-title">No host selected</div>
                </div>
              </div>
            )
          }
        </Rf.ViewBody>
      </>
    );
  }

  // static getDerivedStateFromProps(props: Rf.ViewProps<Model>, state: ViewProtocolEditorState): Partial<ViewProtocolEditorState> | null {
  //   let host = (state.selectedHostId && props.model.hosts[state.selectedHostId]) || null;

  //   if (state.selectedHostId && !host) {
  //     return { draftId: null, selectedHostId: null };
  //   }

  //   if (!host || (state.draftId && !(state.draftId in host.state.drafts))) {
  //     return { draftId: null };
  //   }

  //   return null;
  // }
}



interface VisualEditorProps {
  app: Rf.Application;
  draft: Draft;
  host: Host;
  planData: PlanData | null;
  setPlanData(planData: PlanData | null): void;
  setTextMode(): void;
}

interface VisualEditorState {
  openStageIndices: ImSet<number>;
}

class VisualEditor extends React.Component<VisualEditorProps, VisualEditorState> {
  constructor(props: VisualEditorProps) {
    super(props);

    this.state = {
      openStageIndices: ImSet([0])
    };
  }

  render() {
    let protocol = this.props.draft.protocol;

    if (!protocol) {
      return (
        <div className="view-blank-root">
          <div className="view-blank-container">
            <div className="view-blank-title">Invalid protocol</div>
            <button type="button" className="view-blank-action" onClick={() => {
              this.props.setTextMode();
            }}>Open code view</button>
          </div>
        </div>
      );
    }


    let chip = this.props.planData && this.props.host.state.chips[this.props.planData.chipId];
    let model = chip && this.props.host.state.models[chip.modelId];

    return (
      <div className="protocol-root">
        <h2>{protocol.name ?? 'Untitled protocol'}</h2>

        <div className="protocol-header">
          <span><Rf.Icon name="timeline" /></span>
          <h3>Timeline</h3>
        </div>

        <section>
          <ProtocolTimeline />
        </section>

        <div className="protocol-header">
          <span><Rf.Icon name="format-list-bulleted" /></span>
          <h3>Sequence</h3>
        </div>

        <section>
          <ProtocolOverview app={this.props.app} protocol={protocol} />
        </section>

        <div className="protocol-header">
          <span><Rf.Icon name="flag" /></span>
          <h3>Start</h3>

          <div>
            <Rf.MenuSelect
              menu={Object.values(this.props.host.state.chips).map((chip) => ({
                id: chip.id,
                name: chip.name,
                icon: 'memory',
                disabled: protocol?.modelIds && !protocol.modelIds.includes(chip.modelId)
              }))}
              selectedOptionPath={chip ? [chip.id] : null}
              onSelect={(selection) => {
                let chipId = selection.first() as ChipId;
                let chip = this.props.host.state.chips[chipId];
                let model = this.props.host.state.models[chip.modelId];

                this.props.setPlanData({
                  chipId,
                  data: Object.fromEntries(
                    Units.map(([namespace, Unit]) => [namespace, Unit.createCode(protocol!, model)])
                  ) as UnitsCode
                })
              }} />
          </div>
        </div>

        {this.props.planData && (
          <section>
            <div className="protocol-config-root">
              {Units.map(([namespace, unit]) => {
                return (
                  <unit.CodeEditor
                    chip={chip!}
                    draft={this.props.draft}
                    model={model!}
                    code={this.props.planData!.data[namespace]}
                    setCode={(code) => {
                      this.props.setPlanData({
                        ...this.props.planData!,
                        data: {
                          ...this.props.planData?.data,
                          [namespace]: code
                        }
                      });
                    }}
                    key={namespace} />
                );
              })}
            </div>
            <div className="protocol-config-submit">
              <button type="button" onClick={() => {
                this.props.host.backend.startPlan({
                  chipId: this.props.planData!.chipId,
                  data: this.props.planData!.data,
                  draftId: this.props.draft.id
                });
              }}>
                <Rf.Icon name="play-circle" />
                <span>Start</span>
              </button>
            </div>
          </section>
        )}
      </div>
    );
  }
}
