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
      stages: this.props.protocol.stages.map((stage) => {
        return {
          name: stage.name,
          seq: stage.seq
        };
      })
    };


    let width = this.state.width;
    let y = 30;
    let lineWidth = 1.6;
    let marginHor = 20;
    let availWidth = width - marginHor * 2;

    let stageRadius = 5;
    let segmentRadius = 3;

    let [rows, segmentRowIndices] = assemble(data.segments.map((segment, segmentIndex) => ({
      x: segment.position - 20 / availWidth,
      width: 40 / availWidth,
      priority: data.stages.some((stage) => stage.seq[0] === segmentIndex) ? 1 : 0
    })), { rowCount: 2 });

    let firstEmptyRowIndex = rows.findIndex((row) => row.length < 1);
    let rowCount = (firstEmptyRowIndex >= 0)
      ? firstEmptyRowIndex
      : rows.length;

    let height = 58 + (20 * (rowCount - 1));

    let stageLabelTextOptions = { size: '1rem', weight: '500' };
    let labelAssembly = assembleLabels(data.stages.map((stage) => {
      let firstSegment = data.segments[stage.seq[0]];
      let lastSegment = data.segments[stage.seq[1]];

      return {
        width: ((lastSegment?.position ?? 1) - firstSegment.position) * availWidth,
        labelWidth: getTextWidth(stage.name, stageLabelTextOptions)
      };
    }), { margin: marginHor });

    return (
      <div ref={this.refContainer}>
        <svg viewBox={`0 0 ${width} ${height}`} className="timeline-root">
          {data.stages.map((stage, stageIndex) => {
            let firstSegment = data.segments[stage.seq[0]];
            let nextSegment = data.segments[stage.seq[1]];
            let stageLabelAssembly = labelAssembly[stageIndex];
            let stageText = fitText(stage.name, stageLabelAssembly.width, stageLabelTextOptions);

            return (
              <g className="timeline-stage" key={stageIndex}>
                <rect x={marginHor + firstSegment.position * availWidth} y={0} width={((nextSegment?.position ?? 1) - firstSegment.position) * availWidth} height={height} fill="transparent" />
                {stageText && (
                  <text x={marginHor + stageLabelAssembly.x} y={10} fill="currentColor" className="timeline-stagename">
                    {stageText}
                    <title>{stage.name}</title>
                  </text>
                )}

                {data.segments.map((segment, segmentIndex) => {
                  if (!(segmentIndex >= stage.seq[0] && segmentIndex < stage.seq[1])) {
                    return null;
                  }

                  let rowIndex = segmentRowIndices[segmentIndex];
                  let nextSegment = data.segments[segmentIndex + 1];

                  let firstStageSegment = segmentIndex === stage.seq[0];
                  let lastStageSegment = segmentIndex === (stage.seq[1] - 1);

                  let start = marginHor + segment.position * availWidth;
                  let end = marginHor + (nextSegment?.position ?? 1) * availWidth - (lastStageSegment ? stageRadius : segmentRadius);

                  return (
                    <React.Fragment key={segmentIndex}>
                      <g className="timeline-segment">
                        {(rowIndex !== null) && (
                          (segment === firstSegment)
                            ? <text x={start} y={50 + 20 * rowIndex} className="timeline-stagelabel" fill="currentColor">{formatRelativeTime(segment.time)}</text>
                            : <text x={start} y={50 + 20 * rowIndex} className="timeline-segmentlabel" fill="currentColor">{formatRelativeTime(segment.time)}</text>
                        )}
                        <circle cx={start} cy={y} r={firstStageSegment ? stageRadius : segmentRadius} className={'timeline-marker ' + (firstStageSegment ? 'timeline-stagemarker' : '')} fill="currentColor" />
                      </g>
                      {firstStageSegment
                        ? <path d={`M${start + stageRadius} ${y}L${end} ${y}`} stroke="currentColor" strokeWidth={lineWidth} className="timeline-line" />
                        : <path d={`M${end} ${y}L${start + segmentRadius} ${y}`} stroke="currentColor" strokeWidth={lineWidth} className="timeline-line" />}
                    </React.Fragment>
                  );
                })}
              </g>
            );
          })}

          <g className="timeline-segment">
            <circle cx={marginHor + availWidth} cy={y} r={stageRadius} fill="currentColor" className="timeline-marker timeline-stagemarker" />
            <text x={marginHor + availWidth} y="50" fill="currentColor" className="timeline-stagelabel">{formatRelativeTime(this.analysis.done.time)}</text>
          </g>
        </svg>
      </div>
    );
  }
}


interface AssemblySegment {
  priority?: number;
  x: number;
  width: number;
}

function assemble(segments: AssemblySegment[], options?: { rowCount: number }): [AssemblySegment[][], (number | null)[]] {
  let rowCount = (options?.rowCount ?? Infinity);
  let rows: AssemblySegment[][] = isFinite(rowCount)
    ? new Array(rowCount).fill(0).map(() => [])
    : [];

  let segmentRowIndices: (number | null)[] = new Array(segments.length);

  for (let [segmentIndex, segment] of Array.from(segments.entries()).sort(([_a, a], [_b, b]) => (b.priority ?? 0) - (a.priority ?? 0))) {
    let rowIndex = rows.findIndex((rowSegments) => !rowSegments.some((otherSegment) =>
      (segment.x > otherSegment.x) && (segment.x + segment.width < otherSegment.x + otherSegment.width)
    // || (segment.x < otherSegment.x) && (segment.x + segment.width > otherSegment.x + otherSegment.width)
    || (segment.x < otherSegment.x) && (segment.x + segment.width > otherSegment.x)
    || (segment.x < otherSegment.x + otherSegment.width) && (segment.x + segment.width > otherSegment.x + otherSegment.width)
    ));

    let row = rows[rowIndex];

    if (!row && !isFinite(rowCount)) {
      row = [];
      rowIndex = rows.length;
      rows.push(row);
    }

    row?.push(segment);
    segmentRowIndices[segmentIndex] = (rowIndex >= 0 ? rowIndex : null);
  }

  return [rows, segmentRowIndices];
}

// 0--1--2--3--4--5--6--7
//        =====
//                 =
//
// console.log(assemble([
//   { x: 2, width: 4 },
//   { x: 5, width: 0.5 }
// ], 1));



interface LabelAssemblySegment {
  labelWidth: number;
  width: number;
}

function assembleLabels(segments: LabelAssemblySegment[], options?: {
  gap?: number;
  margin?: number;
  maxRelativeLabelWidth?: number;
}) {
  let gap = (options?.gap ?? 50);
  let margin = (options?.margin ?? 0);
  let maxRelativeLabelWidth = (options?.maxRelativeLabelWidth ?? Infinity);

  let cumWidth = cumulativeSum(segments.map((segment) => segment.width));

  let overlaps = segments.map((segment) => {
    return (Math.min(segment.labelWidth - segment.width, (maxRelativeLabelWidth - 1) * segment.width) + gap * 0.5) * 0.5;
  });

  return overlaps.map((overlap, segmentIndex) => {
    let leftX = cumWidth[segmentIndex - 1] ?? 0;
    let rightX = cumWidth[segmentIndex];
    let x = (leftX + rightX) * 0.5;
    let segment = segments[segmentIndex];

    if (overlap < 0) {
      return { x, width: segment.labelWidth };
    }

    let prevOverlap = overlaps[segmentIndex - 1] ?? -(margin + gap * 0.5);
    let nextOverlap = overlaps[segmentIndex + 1] ?? -(margin + gap * 0.5);

    if ((prevOverlap > 0) || (nextOverlap > 0)) {
      return { x, width: segment.width - gap * 0.25 };
    }

    let leftOverlap = Math.max(overlap + prevOverlap, 0);
    let rightOverlap = Math.max(overlap + nextOverlap, 0);

    // console.log(prevOverlap, overlap, nextOverlap);
    // console.log(leftOverlap, rightOverlap);
    // console.log('---');

    return {
      // The second argument ensures the segment respects the maxRelativeLabelWidth option.
      width: Math.min(segment.labelWidth - 2 * Math.max(leftOverlap, rightOverlap), segment.width + overlap * 2),
      x: (leftX + rightX) * 0.5
    };
  });
}


function fitText(text: string, targetWidth: number, options: { size: string; weight: string; }): string | null {
  let nominalWidth = getTextWidth(text, options);

  if (nominalWidth <= targetWidth) {
    return text;
  }

  for (let endIndex = (text.length - 1); endIndex > 0; endIndex -= 1) {
    if (text[endIndex - 1] === ' ') {
      continue;
    }

    let slicedText = text.substring(0, endIndex) + '…';
    let width = getTextWidth(slicedText, options);

    if (width <= targetWidth) {
      return slicedText;
    }
  }

  return null;
}

function cumulativeSum(arr: number[]): number[] {
  let sum = 0;
  return arr.map((item) => sum += item);
}


let getTextWidthCanvas: HTMLCanvasElement | null = null;

function getTextWidth(text: string, options: { size: string; weight: string; }) {
  let fontFamily = window.getComputedStyle(document.body).fontFamily;

  if (!getTextWidthCanvas) {
    getTextWidthCanvas = document.createElement('canvas');
  }

  let ctx = getTextWidthCanvas.getContext('2d')!;
  ctx.font = `${options.weight} ${options.size} ${fontFamily}`;
  let metrics = ctx?.measureText(text);

  return metrics.width;
}
