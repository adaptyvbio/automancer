import * as React from 'react';


export class ProtocolTimeline extends React.Component<{}, { width: number | null; }> {
  refContainer = React.createRef<HTMLDivElement>();

  constructor(props: {}) {
    super(props);

    this.state = {
      width: null
    };
  }

  componentDidMount() {
    if (this.state.width === null) {
      this.setState({ width: this.refContainer.current!.getBoundingClientRect().width });
    }
  }

  render() {
    if (this.state.width === null) {
      return <div ref={this.refContainer} />;
    }


    // Input

    let props = {
      segments: [
        { position: 0.0 },
        { position: 0.1 },
        { position: 0.2 },
        { position: 0.4 },
        { position: 0.65 },
        { position: 0.7 },
        { position: 0.75 },
        { position: 0.8 },
        { position: 0.85 },
        { position: 0.9 },
      ],
      stages: [
        { name: 'Stage 1', seq: [0, 3] },
        { name: 'Stage 2', seq: [3, 7] },
        { name: 'Stage 3', seq: [7, 10] }
      ]
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
          {props.stages.map((stage, stageIndex) => {
            let firstSegment = props.segments[stage.seq[0]];
            let nextSegment = props.segments[stage.seq[1]];

            return (
              <g className="timeline-stage">
                <rect x={marginHor + firstSegment.position * availWidth} y={0} width={((nextSegment?.position ?? 1) - firstSegment.position) * availWidth} height={height} fill="transparent" />
                <text x={marginHor + (firstSegment.position + (nextSegment?.position ?? 1)) * 0.5 * availWidth} y={10} className="timeline-stagename">{stage.name}</text>

                {props.segments.map((segment, segmentIndex) => {
                  if (!(segmentIndex >= stage.seq[0] && segmentIndex < stage.seq[1])) {
                    return null;
                  }

                  let nextSegment = props.segments[segmentIndex + 1];

                  let firstStageSegment = segmentIndex === stage.seq[0];
                  let lastStageSegment = segmentIndex === (stage.seq[1] - 1);

                  let start = marginHor + segment.position * availWidth;
                  let end = marginHor + (nextSegment?.position ?? 1) * availWidth - (lastStageSegment ? stageRadius : segmentRadius);

                  return (
                    <React.Fragment key={segmentIndex}>
                      <g className="timeline-segment">
                        {firstStageSegment && <text x={start} y={50} className="timeline-segmentlabel">13:15</text>}
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
            <text x={marginHor + availWidth} y="50" className="timeline-segmentlabel">14:00</text>
          </g>
        </svg>
      </div>
    );
  }
}
