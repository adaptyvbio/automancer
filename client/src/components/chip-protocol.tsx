import * as React from 'react';
import seqOrd from 'seq-ord';

import { analyzeProtocol } from '../analysis';
import { GraphEditor } from './graph-editor';
import { Host } from '../host';
import { Chip, ChipId } from '../backends/common';
import { formatAbsoluteTime } from '../format';
import { Pool } from '../util';
import { Icon } from './icon';
import { ProgressBar } from './progress-bar';
import { ProtocolOverview } from './protocol-overview';


export interface ChipProtocolProps {
  chipId: ChipId;
  host: Host;
}

export interface ChipProtocolState {

}

export class ChipProtocol extends React.Component<ChipProtocolProps, ChipProtocolState> {
  pool = new Pool();

  get chip() {
    return this.props.host.state.chips[this.props.chipId] as Chip;
  }

  render() {
    let master = this.chip.master!;

    // TODO: Improve
    if (!master) {
      return <div />;
    }

    let protocol = master.protocol;

    return (
      <div className="blayout-contents">
        <div className="pstatus-root">
          {/* <div className="pstatus-subtitle">Current step ({currentSegmentIndex - currentStep.seq[0] + 1}/{currentStep.seq[1] - currentStep.seq[0]})</div> */}
          <div className="pstatus-header">
            <h2 className="pstatus-title">Untitled step</h2>
            <div className="pstatus-time">
              {/* {firstSegmentAnalysis.timeRange && formatAbsoluteTime(firstSegmentAnalysis.timeRange[0])} &ndash; {formatAbsoluteTime(lastSegmentAnalysis.timeRange![1])} */}
              23:15
            </div>
          </div>
{/*
          <div className="pstatus-features">
            {features.map((feature, featureIndex) => (
              <React.Fragment key={featureIndex}>
                <Icon name={feature.icon} />
                <div className="pstatus-feature-label" title={feature.label}>{feature.label}</div>
              </React.Fragment>
            ))}
          </div> */}

          {/* <ProgressBar
            paused={lastEntry.paused}
            value={currentProgress}
            setValue={(progress) => {
              // TODO: generalize
              this.pool.add(async () => {
                await this.props.host.backend.setLocation(this.chip.id, {
                  segmentIndex: lastEntry.segmentIndex,
                  state: { progress }
                });
              });
            }}
            targetEndTime={currentSegmentEndTime} /> */}

          <div className="pstatus-actions">
            {/* {lastEntry.paused
              ? (
                <button type="button" className="pstatus-button" onClick={() => {
                  this.pool.add(() => this.props.host.backend.resume(this.chip.id));
                }}>Resume</button>
              ) : (
                <>
                  <button type="button" className="pstatus-button" onClick={() => {
                    this.pool.add(() => this.props.host.backend.pause(this.chip.id, { neutral: false }));
                  }}>Pause</button>
                  <button type="button" className="pstatus-button" onClick={() => {
                    this.pool.add(() => this.props.host.backend.pause(this.chip.id, { neutral: true }));
                  }}>Pause (neutral)</button>
                </>
              )} */}
            {/* <button type="button" className="pstatus-button" onClick={() => {
              this.pool.add(() => this.props.host.backend.skipSegment(this.chip.id, currentSegmentIndex + 1));
            }}>Skip</button> */}
          </div>
        </div>

        <header className="header header--2">
          <h2>Sequence</h2>
        </header>

        <GraphEditor
          host={this.props.host}
          location={master.state}
          tree={protocol.root} />
      </div>
    );
  }
}
