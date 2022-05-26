import { Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Model } from '..';
import { ProtocolSeq } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
// import { Segments } from '../components/visual-editor';
import * as util from '../util';


let blankImage = new Image();
blankImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';


export default class ViewTest extends React.Component<Rf.ViewProps<Model>> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {};
  }

  render() {
    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group"></div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          {/* <Segments app={this.props.app} /> */}
          <VisualEditor app={this.props.app} />
        </Rf.ViewBody>
      </>
    );
  }
}


export interface Segment {
  id: string;
  features: { icon: string; label: string; }[];
}

export interface Step {
  id: string;
  name: string;
  seq: [number, number];
}


export interface VisualEditorProps {
  app: Rf.ApplicationUnknown;
}

export interface VisualEditorState {
  segments: Segment[];
  steps: Step[];

  drag: {
    segmentId: Segment['id'];
    offset: { x: number; y: number; };
    start: { x: number; y: number; };
  } | null;
  selectedSegmentIndices: ImSet<number>;
}


let a = () => ({
  id: crypto.randomUUID(),
  features: [
    { icon: 'memory', label: Math.floor(Math.random() * 100).toString() + ' Gb' },
    { icon: 'face', label: 'Bob' }
  ]
});

export class VisualEditor extends React.Component<VisualEditorProps, VisualEditorState> {
  constructor(props: VisualEditorProps) {
    super(props);

    this.state = {
      segments: [a(), a(), a(), a()],
      steps: [
        { id: crypto.randomUUID(), name: 'Alpha', seq: [0, 3] },
        { id: crypto.randomUUID(), name: 'Beta', seq: [3, 4] },
      ],

      drag: null,
      selectedSegmentIndices: ImSet()
    };
  }

  create(segmentIndex: number, targetStepIndex: number) {
    this.setState((state) => {
      let createCount = 1;

      let steps = state.steps.map((step, stepIndex) => {
        let isCurrent = (stepIndex === targetStepIndex);
        let isPast = !isCurrent && (step.seq[0] >= segmentIndex);

        let delta0 = isPast ? createCount : 0;
        let delta1 = (isPast || isCurrent) ? createCount : 0;

        // if (stepIndex === targetStepIndex) {
        //   seq = [step.seq[0], step.seq[1] + createCount];
        // } else {
        //   let delta = (step.seq[0] >= segmentIndex) ? createCount : 0;
        //   seq = [step.seq[0] + delta, step.seq[1] + delta];
        // }

        return {
          ...step,
          seq: [step.seq[0] + delta0, step.seq[1] + delta1] as ProtocolSeq
        };
      });

      return {
        segments: [
          ...state.segments.slice(0, segmentIndex),
          a(),
          ...state.segments.slice(segmentIndex)
        ],
        selectedSegmentIndices: state.selectedSegmentIndices.clear().add(segmentIndex),
        steps
      };
    });
  }

  deleteSelected() {
    let segmentIndices = this.state.selectedSegmentIndices;
    let indexMap = arrayMutator(this.state.segments.length, ...segmentIndices.map((index) => [index, -1] as [number, number]));

    this.setState((state) => ({
      segments: state.segments.filter((segment, segmentIndex) => !state.selectedSegmentIndices.has(segmentIndex)),
      selectedSegmentIndices: state.selectedSegmentIndices.clear(),
      steps: state.steps.map((step) => ({
        ...step,
        seq: console.log([indexMap(step.seq[0]), indexMap(step.seq[1])]) || [indexMap(step.seq[0]), indexMap(step.seq[1])]
      }))
    }));
  }

  moveSelected(insertionIndex: number) {
    console.log('move to', insertionIndex);

    let segmentIndices = this.state.selectedSegmentIndices;
    let indexMap = arrayMutator(this.state.segments.length, ...segmentIndices.map((index) => [index, -1] as [number, number]), [insertionIndex, segmentIndices.size]);
    return;

    this.setState((state) => {
      let movedSegments = state.segments.filter((segment) => state.selectedSegmentIds.has(segment.id));
      let actualInsertionIndex = 0;

      let otherSegments = state.segments.filter((segment, segmentIndex) => {
        let other = !state.selectedSegmentIds.has(segment.id);

        if (other && (segmentIndex < insertionIndex)) {
          actualInsertionIndex += 1;
        }

        return other;
      });

      return {
        segments: [
          ...otherSegments.slice(0, actualInsertionIndex),
          ...movedSegments,
          ...otherSegments.slice(actualInsertionIndex)
        ]
      };
    });
  }

  render() {
    // let draggingSegment = this.state.segments.find((segment) => segment.id === this.state.draggingSegmentId);

    return (
      <div className="protoview-root vedit-root">
        {/* {this.state.drag && <GhostSegment
          offset={this.state.drag.offset}
          start={this.state.drag.start}
          segment={this.state.segments.find((segment) => segment.id === this.state.drag!.segmentId)!} />} */}
        <div className="vedit-stage-root _open">
          <a href="#" className="vedit-stage-header">
            <Rf.Icon name="expand-more" />
            <h3 className="vedit-stage-name">Something</h3>
          </a>
          <div className="vedit-stage-steps">
          {this.state.steps.map((step, stepIndex) => (
            <ContextMenuArea key={step.id} onContextMenu={async (event) => {
              await this.props.app.showContextMenu(event, [
                { id: '_header', name: 'Protocol step', type: 'header' },
                { id: 'delete', name: 'Delete', shortcut: 'X' }
              ], (menuPath) => {

              });
            }}>
              <div className="vedit-step-item" key={step.id}>
                <div className="vedit-step-header">
                  <div className="vedit-step-time">00:00</div>
                  <div className="vedit-step-name">{step.name}</div>
                </div>
                <div className="vedit-segment-list">
                  <SegmentsDivider
                    onDrop={() => void this.moveSelected(step.seq[0])}
                    onTrigger={() => void this.create(step.seq[0], stepIndex)} />

                  {new Array(step.seq[1] - step.seq[0]).fill(0).map((_, segmentRelIndex) => {
                    let segmentIndex = step.seq[0] + segmentRelIndex;
                    let segment = this.state.segments[segmentIndex];

                    return (
                      <React.Fragment key={segment.id}>
                        <ContextMenuArea onContextMenu={async (event) => {
                          event.stopPropagation();

                          await this.props.app.showContextMenu(event, [
                            { id: '_header', name: 'Protocol segment', type: 'header' },
                            { id: 'delete', name: 'Delete', shortcut: 'X' }
                          ], (menuPath) => {
                            // if (menuPath.first() === 'delete') {
                            //   this.deleteSegment();
                            // }
                          });
                        }}>
                          <div
                            className={util.formatClass('vedit-segment-features', { '_selected': this.state.selectedSegmentIndices.includes(segmentIndex) })}
                            key={segment.id}
                            draggable
                            tabIndex={-1}
                            onBlur={(event) => {
                              if (!event.currentTarget.parentElement!.parentElement!.parentElement!.contains(event.relatedTarget)) {
                                this.setState((state) => ({
                                  selectedSegmentIndices: state.selectedSegmentIndices.clear()
                                }));

                                // console.log('CLEAR', event.relatedTarget)
                              }
                            }}
                            onKeyDown={(event) => {
                              switch (event.key) {
                                case 'Backspace': {
                                  this.deleteSelected();

                                  // this.setState((state) => ({
                                  //   segments: state.segments.filter((segment, segmentIndex) => !state.selectedSegmentIndices.has(segmentIndex)),
                                  //   selectedSegmentIndices: state.selectedSegmentIndices.clear()
                                  // }));

                                  break;
                                }

                                case 'Escape': {
                                  this.setState((state) => ({
                                    selectedSegmentIndices: state.selectedSegmentIndices.clear()
                                  }));

                                  break;
                                }

                                default: return;
                              }

                              event.preventDefault();
                            }}
                            onClick={(event) => {
                              this.setState((state) => {
                                if (event.metaKey) {
                                  return { selectedSegmentIndices: util.toggleSet(state.selectedSegmentIndices, segmentIndex) };
                                } else {
                                  return { selectedSegmentIndices: state.selectedSegmentIndices.clear().add(segmentIndex) };
                                }
                              });
                            }}
                            onDragStart={(event) => {
                              event.dataTransfer.setData('text/plain', JSON.stringify({ sourceId: segment.id }));
                              // event.dataTransfer.setDragImage(blankImage, 0, 0);

                              // this.setState({ draggingSegmentId: segment.id });
                              // event.dataTransfer.dropEffect = "copy";
                              let rect = event.currentTarget.getBoundingClientRect();

                              let offset = {
                                x: event.clientX - rect.x,
                                y: event.clientY - rect.y
                              };

                              let start = { x: event.clientX, y: event.clientY };

                              this.setState((state) => ({
                                drag: {
                                  segmentId: segment.id,
                                  offset,
                                  start
                                },
                                selectedSegmentIndices: state.selectedSegmentIndices.has(segmentIndex)
                                  ? state.selectedSegmentIndices
                                  : state.selectedSegmentIndices.clear().add(segmentIndex)
                              }));
                            }}
                            onDragEnd={() => {
                              this.setState({ drag: null });
                            }}>
                            {segment.features.map((feature, featureIndex) => (
                              <React.Fragment key={featureIndex}>
                                <Rf.Icon name={feature.icon} />
                                <span>{feature.label}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        </ContextMenuArea>

                        <SegmentsDivider
                          onDrop={() => void this.moveSelected(segmentIndex + 1)}
                          onTrigger={() => void this.create(segmentIndex + 1, stepIndex)} />

                        {/* <button type="button" className="vedit-segment-dropzone">
                          <div />
                          <div>
                            <Rf.Icon name="add-circle" />
                            <div>Add segment</div>
                          </div>
                          <div />
                        </button> */}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </ContextMenuArea>
          ))}
          </div>
        </div>
      </div>
    );
  }
}


function SegmentsDivider(props: {
  onDrop(): void;
  onTrigger?(): void;
}) {
  let [over, setOver] = React.useState(false);

  return (
    <button type="button" className={util.formatClass('vedit-segment-dropzone', { '_over': over })}
      onClick={props.onTrigger}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragEnter={(event) => {
        // if (event.target === event.currentTarget) {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(true);
          console.log('Enter', event);
        }
      }}
      onDragLeave={(event) => {
        // if (event.target === event.currentTarget) {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(false);
          console.log('Leave', event);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        console.log('Drop from', event.dataTransfer.getData('text/plain'));
        setOver(false);
        props.onDrop();
      }}>
      <div />
      <div>
        <Rf.Icon name="add-circle" />
        <div>Add segment</div>
      </div>
      <div />
    </button>
  );
}


/* export interface GhostSegmentProps {
  offset: { x: number; y: number; };
  start: { x: number; y: number; };
  segment: Segment;
}

export class GhostSegment extends React.Component<GhostSegmentProps> {
  controller = new AbortController();
  state = {
    position: { x: 0, y: 0 }
  };

  componentDidMount() {
    document.addEventListener('mousemove', (event) => {
      event.preventDefault();
      console.log(event.clientX, event.clientY);
    }, { capture: true, signal: this.controller.signal });
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  render() {
    return (
      <div className="vedit-segment-features" style={{
        position: 'absolute',
        left: `${this.props.start.x - this.props.offset.x}px`,
        top: `${this.props.start.y - this.props.offset.y}px`,
        backgroundColor: '#fff',
        width: '412px',
        zIndex: 1000,
        pointerEvents: 'none'
      }}>
        {this.props.segment.features.map((feature, featureIndex) => (
          <React.Fragment key={featureIndex}>
            <Rf.Icon name={feature.icon} />
            <span>{feature.label}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }
} */


function arrayMutator(oldSize: number, ...actions: [number, number][]): (oldIndex: number) => number {
// function arrayMutator(oldSize: number, ...actions: [number, number][]): Record<number, number | null> {
  let map: Record<number, number | null> = Object.fromEntries(new Array(oldSize).fill(0).map((_, index) => [index, index]));
  let size = oldSize;

  for (let [oldPos, delta] of actions) {
    for (let i = oldPos; i < oldSize; i++) {
      if (map[i] !== null) {
        map[i] += delta;
      }
    }

    for (let i = oldPos; i < oldPos - Math.min(delta, 0); i++) {
      // map[i] = null;
      map[i] = map[oldPos - delta] ?? (size + delta);
    }

    size += delta;
  }

  map[oldSize] = size;

  console.log('MAP', map);

  let query = (oldIndex: number): number => {
    // if (oldIndex === oldSize) {
    //   return size;
    // }

    return map[oldIndex];
  };

  return query;
}


arrayMutator(3, [0, -1]);
arrayMutator(3, [0, -1], [1, 1]);

// arrayMutator(3, [1, -1], [0, 1]);
