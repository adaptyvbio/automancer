import * as React from 'react';

import { analyzeProtocol } from '../analysis';
import { Host } from '../application';
import { ChipId } from '../backends/common';
import { formatAbsoluteTime } from '../format';
import { Pool } from '../util';
import { ProgressBar } from './progress-bar';
import { ProtocolOverview } from './protocol-overview';


export interface ChipProtocolProps {
  chipId: ChipId;
  host: Host;
}

export class ChipProtocol extends React.Component<ChipProtocolProps, {}> {
  pool = new Pool();

  get chip() {
    return this.props.host.state.chips[this.props.chipId];
  }

  render() {
    let master = this.chip.master!;

    // TODO: Improve
    if (!master) {
      return <div />;
    }

    let protocol = master.protocol;
    let analysis = analyzeProtocol(protocol, master.entries);
    let lastEntry = master.entries.at(-1);

    let currentSegmentIndex = analysis.current!.segmentIndex;
    let _currentSegment = protocol.segments[currentSegmentIndex];

    let currentStage = protocol.stages.find((stage) => (stage.seq[0] <= currentSegmentIndex) && (stage.seq[1] > currentSegmentIndex))!;
    let currentStep = currentStage.steps.find((step) => (step.seq[0] <= currentSegmentIndex) && (step.seq[1] > currentSegmentIndex))!;

    let firstSegmentAnalysis = analysis.segments[currentStep.seq[0]];
    let lastSegmentAnalysis = analysis.segments[currentStep.seq[1] - 1];

    // console.log(analysis);
    console.log(master);

    return (
      <div className="blayout-contents">
        <div className="pstatus-root">
          <div className="pstatus-subtitle">Current step ({currentSegmentIndex - currentStep.seq[0] + 1}/{currentStep.seq[1] - currentStep.seq[0]})</div>
          <div className="pstatus-header">
            <h2 className="pstatus-title">{currentStep.name}</h2>
            <div className="pstatus-time">
              {firstSegmentAnalysis.timeRange && formatAbsoluteTime(firstSegmentAnalysis.timeRange[0])} &ndash; {formatAbsoluteTime(lastSegmentAnalysis.timeRange![1])}
            </div>
          </div>

          <ProgressBar
            paused={lastEntry.paused}
            value={0.5}
            setValue={(progress) => {
              console.log(progress);
              // TODO: generalize
              this.pool.add(async () => {
                await this.props.host.backend.setLocation(this.chip.id, {
                  segmentIndex: lastEntry.segmentIndex,
                  state: { progress }
                });
              });
            }} />

          <div className="pstatus-actions">
            {lastEntry.paused
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
              )}
            <button type="button" className="pstatus-button" onClick={() => {
              this.pool.add(() => this.props.host.backend.skipSegment(this.chip.id, currentSegmentIndex + 1));
            }}>Skip</button>
          </div>
        </div>

        <header className="header header--2">
          <h2>Sequence</h2>
        </header>

        <ProtocolOverview
          analysis={analysis}
          master={master}
          protocol={master.protocol}
          setLocation={(location) => {
            this.pool.add(async () => {
              await this.props.host.backend.setLocation(this.chip.id, location);
            });
          }} />
      </div>
    )
  }
}
