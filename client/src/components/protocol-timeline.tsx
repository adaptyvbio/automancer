import * as React from 'react';
import { type Analysis, analyzeProtocol } from '../analysis';

import { Protocol } from '../backends/common';
import { formatDuration, formatRelativeTime } from '../format';


export interface ProtocolTimelineProps {
  analysis?: Analysis;
  protocol: Protocol;
}

export class ProtocolTimeline extends React.Component<ProtocolTimelineProps, { width: number | null; }> {
  analysis: Analysis;
  observer: ResizeObserver;
  refContainer = React.createRef<HTMLDivElement>();

  constructor(props: ProtocolTimelineProps) {
    super(props);

    this.analysis = props.analysis ?? analyzeProtocol(props.protocol);

    this.state = {
      width: null
    };

    this.observer = new ResizeObserver((_entries) => {
      this.updateSize();
    });
  }

  componentDidMount() {
    this.updateSize();
    this.observer.observe(this.refContainer.current!);
  }

  componentWillUnmount() {
    this.observer.disconnect();
  }

  updateSize() {
    this.setState({ width: this.refContainer.current!.getBoundingClientRect().width });
  }

  render() {
    if (this.state.width === null) {
      return <div ref={this.refContainer} />;
    }


    // Input

    let data = {
      segments: this.props.protocol.stages
        .flatMap((stage) => stage.steps)
        .map((step) => {
          let firstSegmentAnalysis = this.analysis.segments[step.seq[0]];

          return {
            position: firstSegmentAnalysis.timeRange![0] / this.analysis.done.time,
            time: firstSegmentAnalysis.timeRange![0]
          };
        }),
      stages: this.props.protocol.stages.map((stage, stageIndex) => {
        return {
          name: stage.name,
          seq: stage.seq
        };
      })
    };


    let width = this.state.width;
    let height = 60;
    let y = 30;
    let lineWidth = 1.6;
    let marginHor = 20;
    let availWidth = width - marginHor * 2;

    let stageRadius = 5;
    let segmentRadius = 3;

    return (
      <div ref={this.refContainer}>
        <svg viewBox={`0 0 ${width} ${height}`} className="timeline-root">
          {data.stages.map((stage, stageIndex) => {
            let firstSegment = data.segments[stage.seq[0]];
            let nextSegment = data.segments[stage.seq[1]];

            return (
              <g className="timeline-stage" key={stageIndex}>
                <rect x={marginHor + firstSegment.position * availWidth} y={0} width={((nextSegment?.position ?? 1) - firstSegment.position) * availWidth} height={height} fill="transparent" />
                <text x={marginHor + (firstSegment.position + (nextSegment?.position ?? 1)) * 0.5 * availWidth} y={10} className="timeline-stagename">{stage.name}</text>

                {data.segments.map((segment, segmentIndex) => {
                  if (!(segmentIndex >= stage.seq[0] && segmentIndex < stage.seq[1])) {
                    return null;
                  }

                  let nextSegment = data.segments[segmentIndex + 1];

                  let firstStageSegment = segmentIndex === stage.seq[0];
                  let lastStageSegment = segmentIndex === (stage.seq[1] - 1);

                  let start = marginHor + segment.position * availWidth;
                  let end = marginHor + (nextSegment?.position ?? 1) * availWidth - (lastStageSegment ? stageRadius : segmentRadius);

                  return (
                    <React.Fragment key={segmentIndex}>
                      <g className="timeline-segment">
                        {firstStageSegment && <text x={start} y={50} className="timeline-segmentlabel">{formatRelativeTime(firstSegment.time)}</text>}
                        <circle cx={start} cy={y} r={firstStageSegment ? stageRadius : segmentRadius} className={'timeline-marker ' + (firstStageSegment ? 'timeline-stagemarker' : '')} />
                      </g>
                      {firstStageSegment
                        ? <path d={`M${start + stageRadius} ${y}L${end} ${y}`} stroke="#000" strokeWidth={lineWidth} className="timeline-line" />
                        : <path d={`M${end} ${y}L${start + segmentRadius} ${y}`} stroke="#000" strokeWidth={lineWidth} className="timeline-line" />}
                    </React.Fragment>
                  );
                })}
              </g>
            );
          })}

          <g className="timeline-segment">
            <circle cx={marginHor + availWidth} cy={y} r={stageRadius} className="timeline-marker timeline-stagemarker" />
            <text x={marginHor + availWidth} y="50" className="timeline-segmentlabel">{formatRelativeTime(this.analysis.done.time)}</text>
          </g>
        </svg>
      </div>
    );
  }
}
