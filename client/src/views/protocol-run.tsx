import { Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
import { analyzeProtocol } from '../analysis';
import { BlankState } from '../components/blank-state';
import { ProgressBar } from '../components/progress-bar';
import type { Chip, ChipId, ChipModel, ControlNamespace, Draft, DraftId, HostId, Protocol } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import { ProtocolOverview } from '../components/protocol-overview';
import SelectChip from '../components/select-chip';
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

  componentDidUpdate() {
    if (!this.state.selectedHostChipId) {
      let host = Object.values(this.props.model.hosts)[0];
      let chip = host && Object.values(host.state.chips).find((chip) => chip.master);

      if (chip) {
        this.setState({ selectedHostChipId: [host.id, chip.id] });
      }
    }
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
          {chip
            ? (() => {
              let master = chip.master!;
              let protocol = master.protocol;
              let lastEntry = master.entries.at(-1);

              let analysis = analyzeProtocol(protocol, master.entries);
              let currentSegmentIndex = analysis.current!.segmentIndex;
              let _currentSegment = protocol.segments[currentSegmentIndex];

              let currentStage = protocol.stages.find((stage) => (stage.seq[0] <= currentSegmentIndex) && (stage.seq[1] > currentSegmentIndex))!;
              let currentStep = currentStage.steps.find((step) => (step.seq[0] <= currentSegmentIndex) && (step.seq[1] > currentSegmentIndex))!;

              let firstSegmentAnalysis = analysis.segments[currentStep.seq[0]];
              let lastSegmentAnalysis = analysis.segments[currentStep.seq[1] - 1];

              return (
                <div className="protocol-root">
                  <div className="status-root">
                    <div className="status-subtitle">Current step ({currentSegmentIndex - currentStep.seq[0] + 1}/{currentStep.seq[1] - currentStep.seq[0]})</div>
                    <div className="status-header">
                      <h2 className="status-title">{currentStep.name}</h2>
                      <div className="status-time">
                        {firstSegmentAnalysis.timeRange && formatTime(firstSegmentAnalysis.timeRange[0])} &ndash; {formatTime(lastSegmentAnalysis.timeRange![1])}
                      </div>
                    </div>

                    {/* <div className="status-progress">
                      <P />
                    </div> */}

                    <div className="status-actions">
                      {lastEntry.paused
                        ? (
                          <button type="button" className="status-button" onClick={() => {
                            host!.backend.resume(chip!.id);
                          }}>Resume</button>
                        ) : (
                          <>
                            <button type="button" className="status-button" onClick={() => {
                              host!.backend.pause(chip!.id, { neutral: false });
                            }}>Pause</button>
                            <button type="button" className="status-button" onClick={() => {
                              host!.backend.pause(chip!.id, { neutral: true });
                            }}>Pause (neutral)</button>
                          </>
                        )}
                      <button type="button" className="status-button" onClick={() => {
                        host!.backend.skipSegment(chip!.id, currentSegmentIndex + 1);
                      }}>Skip</button>
                    </div>

                    <div className="status-overview">
                      <ProtocolOverview app={this.props.app} analysis={analysis} protocol={protocol} master={chip.master!} />
                    </div>
                  </div>
                </div>
              );
            })() : (
              <BlankState message="No chip selected" />
            )}
        </Rf.ViewBody>
      </>
    );
  }
}


function formatTime(input: number): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: undefined, hour12: false, timeStyle: 'short' }).format(input);
}


function P() {
  let [value, setValue] = React.useState(0.5);

  return <ProgressBar value={value} setValue={(newValue) => {
    setValue(newValue);
  }} />
}
