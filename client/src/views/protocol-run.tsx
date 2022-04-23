import { Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
import { BlankState } from '../components/blank-state';
import type { Chip, ChipId, ChipModel, ControlNamespace, Draft, DraftId, HostId, Protocol } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import SelectChip from '../components/select-chip';
import { Segments } from '../components/visual-editor';
import * as util from '../util';

interface ViewProtocolRunState {
  selectedHostChipId: [HostId, ChipId] | null;
}

export default class ViewProtocolRun extends React.Component<Rf.ViewProps<Model>, ViewProtocolRunState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      selectedHostChipId: null
    };
  }

  render() {
    let host = this.state.selectedHostChipId && this.props.model.hosts[this.state.selectedHostChipId[0]];
    let chip = this.state.selectedHostChipId && host!.state.chips[this.state.selectedHostChipId[1]];

    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root" />
          <div className="toolbar-root">
            <div className="toolbar-group">
              <SelectChip
                filterChip={(chip) => chip.master}
                hosts={this.props.model.hosts}
                onSelect={(selectedHostChipId) => {
                  this.setState({ selectedHostChipId });
                }}
                selected={this.state.selectedHostChipId} />
            </div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          <div className="protocol-root">
            <div className="status-root">
              <div className="status-subtitle">Current step</div>
              <div className="status-header">
                <h2 className="status-title">Flow Neutravidin</h2>
                <div className="status-time">14:14 – 14:38 &middot; 20 min</div>
              </div>
              {/* <div className="status-list">
                <div className="status-segment">
                  <span><Rf.Icon name="hourglass-empty" /></span><span>20 min</span>
                  <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
                </div>
                <div className="status-segment">
                  <span><Rf.Icon name="hourglass-empty" /></span><span>20 min</span>
                  <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
                </div>
              </div> */}
              {/* <div className="status-list">
                <div className="status-segment">
                  <span><Rf.Icon name="hourglass-empty" /></span><span>20 min</span>
                  <span><Rf.Icon name="air" /></span><span>Biotin BSA</span>
                  <span><Rf.Icon name="announcement" /></span><span>Biotin BSA</span>
                  <span><Rf.Icon name="touch-app" /></span><span>Confirm</span>
                  <span>⎈</span><span>Multiplexer<sup>+</sup></span>
                </div>
                <div className="status-segment">
                  <span>⁂</span><span>Button</span>
                  <span>↬</span><span>Pump 200 µl</span>
                  <span>⌘</span><span>Confirm action</span>
                  <span>⧖</span><span>Wait 6 min</span>
                  <span>✱</span><span>Notify</span>
                </div>
              </div> */}

              <Segments app={this.props.app} />
            </div>
          </div>

          {/* {chip
            ? <div />
            : <BlankState message="No chip selected" />} */}
        </Rf.ViewBody>
      </>
    );
  }
}
