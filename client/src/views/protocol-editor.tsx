import { List, OrderedMap } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Model } from '..';
import type { ChipId, HostId } from '../backends/common';
import type ViewChipSettings from './chip-settings';
import type ViewControl from './control';


interface ViewProtocolEditorState {
  selectedHostId: HostId | null;
}

export default class ViewProtocolEditor extends React.Component<Rf.ViewProps<Model>, ViewProtocolEditorState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      selectedHostId: null
    };
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
                      { id: 'open', name: 'Open...' },
                      { id: 'recent', name: 'Open recent', children: [
                        { id: '_none', name: 'No recent protocols', disabled: true }
                      ] }
                    ] },
                  { id: 'edit',
                    name: 'Edit',
                    children: [
                      { id: 'undo', name: 'Undo' }
                    ] }
                ]}
                onSelect={(path) => {
                  if (path.equals(List(['file', 'open']))) {
                    let input = document.createElement('input');
                    input.setAttribute('type', 'file');

                    input.addEventListener('change', () => {
                      if (input.files) {
                        let file = input.files[0];

                        (async () => {
                          let text = await file.text();
                        })();
                      }
                    });

                    input.click();
                  }
                }} />
            </div>
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
          <div className="proto-root">
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
                    {/* <div className="proto-control-flow">→ Biotin BSA</div>
                    <div className="proto-control-ctrl">⎈ Multiplexer<sup>+</sup></div>
                    <div className="proto-control-ctrl">⁂ Button<sup>+</sup></div> */}
                    {/* ⁺ */}
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
          </div>
        </Rf.ViewBody>
      </>
    );
  }
}
