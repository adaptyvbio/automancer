import { List, Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Model } from '..';
import { ProtocolSeq } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import * as util from '../util';


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
  segments: List<Segment>;
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
      segments: List([a(), a(), a(), a()]),
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
        let isPast = (stepIndex > targetStepIndex); // = is created segment past

        let delta0 = isPast ? createCount : 0;
        let delta1 = (isPast || isCurrent) ? createCount : 0;

        return {
          ...step,
          seq: [step.seq[0] + delta0, step.seq[1] + delta1] as ProtocolSeq
        };
      });

      return {
        segments: state.segments.insert(segmentIndex, a()),
        selectedSegmentIndices: state.selectedSegmentIndices.clear().add(segmentIndex),
        steps
      };
    });
  }

  deleteSelected() {
    this.setState((state) => {
      let segmentIndices = (state.selectedSegmentIndices.toJS() as number[]).sort((a, b) => a - b);
      let segmentIndexIndex = 0;
      let delta = 0;

      let steps = state.steps.map((step, stepIndex) => {
        let delta0 = -delta;

        for (; (step.seq[0] <= segmentIndices[segmentIndexIndex])
          && (step.seq[1] > segmentIndices[segmentIndexIndex])
          && (segmentIndexIndex < segmentIndices.length); segmentIndexIndex += 1) {
          delta += 1;
        }

        let delta1 = -delta;

        return {
          ...step,
          seq: [step.seq[0] + delta0, step.seq[1] + delta1] as ProtocolSeq
        };
      });

      return {
        segments: state.segments.filter((segment, segmentIndex) => !state.selectedSegmentIndices.has(segmentIndex)),
        selectedSegmentIndices: state.selectedSegmentIndices.clear(),
        steps
      };
    });
  }

  moveSelected(targetSegmentIndex: number, targetStepIndex: number) {
    this.setState((state) => {
      let segmentIndices = (state.selectedSegmentIndices.toJS() as number[]).sort((a, b) => a - b);
      let segmentIndexIndex = 0;
      let delta = 0;
      let insertionIndex!: number;

      let steps = state.steps.map((step, stepIndex) => {
        let delta0 = delta;

        for (; (step.seq[0] <= segmentIndices[segmentIndexIndex])
          && (Math.min(targetSegmentIndex, step.seq[1]) > segmentIndices[segmentIndexIndex])
          && (segmentIndexIndex < segmentIndices.length); segmentIndexIndex += 1) {
          delta -= 1;
        }

        if (stepIndex === targetStepIndex) {
          insertionIndex = targetSegmentIndex + delta;
          delta += segmentIndices.length;
        }

        for (; (step.seq[1] > segmentIndices[segmentIndexIndex])
          && (segmentIndexIndex < segmentIndices.length); segmentIndexIndex += 1) {
          delta -= 1;
        }

        let delta1 = delta;

        return {
          ...step,
          seq: [step.seq[0] + delta0, step.seq[1] + delta1] as ProtocolSeq
        };
      });

      let stillSegments = state.segments.filter((_segment, segmentIndex) => !state.selectedSegmentIndices.has(segmentIndex));
      let movedSegments = state.segments.filter((_segment, segmentIndex) => state.selectedSegmentIndices.has(segmentIndex));

      return {
        segments: stillSegments.splice(insertionIndex, 0, ...movedSegments),
        selectedSegmentIndices: state.selectedSegmentIndices.clear(),
        steps
      };
    });
  }

  render() {
    // console.log(...this.state.steps.map((s) => s.seq));

    return (
      <div className="protoview-root vedit-root">
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
                    onDrop={() => void this.moveSelected(step.seq[0], stepIndex)}
                    onTrigger={() => void this.create(step.seq[0], stepIndex)} />

                  {new Array(step.seq[1] - step.seq[0]).fill(0).map((_, segmentRelIndex) => {
                    let segmentIndex = step.seq[0] + segmentRelIndex;
                    let segment = this.state.segments.get(segmentIndex)!;

                    return (
                      <React.Fragment key={segment.id}>
                        <ContextMenuArea onContextMenu={async (event) => {
                          event.stopPropagation();

                          // TODO: DRY
                          let selectedSegmentIndices = this.state.selectedSegmentIndices.has(segmentIndex)
                            ? this.state.selectedSegmentIndices
                            : this.state.selectedSegmentIndices.clear().add(segmentIndex);

                          this.setState({ selectedSegmentIndices });

                          await this.props.app.showContextMenu(event, [
                            { id: '_header', name: 'Protocol segment', type: 'header' },
                            { id: 'delete', name: 'Delete', shortcut: 'X' }
                          ], (menuPath) => {
                            if (menuPath.first() === 'delete') {
                              this.deleteSelected();
                            }
                          });
                        }}>
                          <div
                            className={util.formatClass('vedit-segment-features', { '_selected': this.state.selectedSegmentIndices.has(segmentIndex) })}
                            key={segment.id}
                            draggable
                            tabIndex={-1}
                            onBlur={(event) => {
                              // if (!event.currentTarget.parentElement!.parentElement!.parentElement!.contains(event.relatedTarget)) {
                              //   this.setState((state) => ({
                              //     selectedSegmentIndices: state.selectedSegmentIndices.clear()
                              //   }));
                              // }
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
                          onDrop={() => void this.moveSelected(segmentIndex + 1, stepIndex)}
                          onTrigger={() => void this.create(segmentIndex + 1, stepIndex)} />
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
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
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
