import { List, Range, Set as ImSet } from 'immutable';
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


export interface Stage {
  id: string;
  name: string;
  stepSeq: ProtocolSeq;
}

export interface Step {
  id: string;
  name: string;
  seq: ProtocolSeq;
}

export interface Segment {
  id: string;
  features: { icon: string; label: string; }[];
}


export interface VisualEditorProps {
  app: Rf.ApplicationUnknown;
}

export interface VisualEditorState {
  stages: List<Stage>;
  steps: List<Step>;
  segments: List<Segment>;

  drag: {
    segmentId: Segment['id'];
    offset: { x: number; y: number; };
    start: { x: number; y: number; };
  } | null;

  openStageIndices: ImSet<number>;

  activeSegmentIndex: number | null;
  selectedSegmentIndices: ImSet<number>;
}


let a = () => ({
  id: crypto.randomUUID(),
  features: [
    { icon: 'memory', label: Math.floor(Math.random() * 100).toString() + ' Gb' },
    // { icon: 'face', label: 'Alice' },
    { icon: 'face', label: 'Bob' }
  ]
});

export class VisualEditor extends React.Component<VisualEditorProps, VisualEditorState> {
  constructor(props: VisualEditorProps) {
    super(props);

    this.state = {
      stages: List([
        { id: crypto.randomUUID(),
          name: 'Stage A',
          stepSeq: [0, 2] },
        { id: crypto.randomUUID(),
          name: 'Stage B',
          stepSeq: [2, 3] }
      ]),
      steps: List([
        { id: crypto.randomUUID(), name: 'Alpha', seq: [0, 3] },
        { id: crypto.randomUUID(), name: 'Beta', seq: [3, 4] },
        { id: crypto.randomUUID(), name: 'Delta', seq: [4, 5] },
      ]),
      segments: List([a(), a(), a(), a(), a()]),

      drag: null,

      openStageIndices: ImSet([0]),

      activeSegmentIndex: null,
      selectedSegmentIndices: ImSet()
    };
  }

  deleteStage(targetStageIndex: number) {
    this.setState((state) => {
      let stage = state.stages.get(targetStageIndex)!;

      let segmentSeq = [
        state.steps.get(stage.stepSeq[0])?.seq[0] ?? state.segments.size,
        stage.stepSeq[1] !== stage.stepSeq[0]
          ? state.steps.get(stage.stepSeq[1] - 1)!.seq[1]
          : state.steps.get(stage.stepSeq[1])?.seq[0] ?? state.segments.size
      ];

      let deletedSegmentCount = segmentSeq[1] - segmentSeq[0];

      return {
        activeSegmentIndex: null,
        stages: util.renumber.deleteItem(state.stages, 'stepSeq', targetStageIndex),
        steps: util.renumber.deleteRange(state.steps, 'seq', stage.stepSeq[0], stage.stepSeq[1], deletedSegmentCount),
        segments: state.segments.splice(segmentSeq[0], deletedSegmentCount),
        selectedSegmentIndices: state.selectedSegmentIndices.clear()
      };
    });
  }

  deleteStep(targetStepIndex: number) {
    this.setState((state) => {
      let targetStep = state.steps.get(targetStepIndex)!;

      return {
        stages: util.renumber.deleteChildItem(state.stages, 'stepSeq', targetStepIndex),
        steps: util.renumber.deleteItem(state.steps, 'seq', targetStepIndex),
        segments: state.segments.splice(targetStep.seq[0], targetStep.seq[1] - targetStep.seq[0])
      };
    });
  }

  createStep(targetStepIndex: number, targetStageIndex: number) {
    this.setState((state) => {
      let targetSegmentIndex = state.steps.get(targetStepIndex)?.seq[0] ?? state.segments.size;

      return {
        stages: util.renumber.createChildItem(state.stages, 'stepSeq', targetStageIndex),
        steps: state.steps.insert(targetStepIndex, {
          id: crypto.randomUUID(),
          name: 'New step',
          seq: [targetSegmentIndex, targetSegmentIndex]
        })
      };
    });
  }

  createSegment(targetSegmentIndex: number, targetStepIndex: number) {
    this.setState((state) => {
      return {
        steps: util.renumber.createChildItem(state.steps, 'seq', targetStepIndex),
        segments: state.segments.insert(targetSegmentIndex, a()),

        activeSegmentIndex: targetSegmentIndex,
        selectedSegmentIndices: state.selectedSegmentIndices.clear().add(targetSegmentIndex),
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
        activeSegmentIndex: null,
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
        selectedSegmentIndices: state.selectedSegmentIndices.clear().union(Range(insertionIndex, insertionIndex + movedSegments.size)),
        steps
      };
    });
  }

  render() {
    console.log(
      'INFO',
      this.state.stages.toJS(),
      this.state.steps.toJS(),
      this.state.segments.toJS()
    );

    for (let [stageIndex, stage] of this.state.stages.entries()) {
      if (stageIndex === 0) {
        if (stage.stepSeq[0] !== 0) throw new Error();
      } else {
        if (stage.stepSeq[0] !== this.state.stages.get(stageIndex - 1)!.stepSeq[1]) throw new Error();
      }
    }

    if ((this.state.stages.last()?.stepSeq[1] ?? 0) !== this.state.steps.size) throw new Error();


    for (let [stepIndex, step] of this.state.steps.entries()) {
      if (stepIndex === 0) {
        if (step.seq[0] !== 0) throw new Error();
      } else {
        if (step.seq[0] !== this.state.steps.get(stepIndex - 1)!.seq[1]) throw new Error();
      }
    }

    if ((this.state.steps.last()?.seq[1] ?? 0) !== this.state.segments.size) throw new Error();


    return (
      <div className="protoview-root vedit-root">
        {this.state.stages.map((stage, stageIndex) => {
          let stepCount = stage.stepSeq[1] - stage.stepSeq[0];

          return (
            <div className={util.formatClass('vedit-stage-root', { '_open': this.state.openStageIndices.has(stageIndex) })} key={stage.id}>
              <ContextMenuArea onContextMenu={async (event) => {
                await this.props.app.showContextMenu(event, [
                  { id: '_header', name: 'Protocol stage', type: 'header' },
                  { id: 'delete', name: 'Delete' }
                ], (menuPath) => {
                  if (menuPath.first() === 'delete') {
                    this.deleteStage(stageIndex);
                  }
                });
              }}>
                <a href="#" className="vedit-stage-header" onClick={(event) => {
                  event.preventDefault();

                  this.setState((state) => ({
                    openStageIndices: util.toggleSet(state.openStageIndices, stageIndex)
                  }));
                }}>
                  <Rf.Icon name="expand-more" />
                  <h3 className="vedit-stage-name">{stage.name}</h3>
                  {(stepCount > 0) && <div className="vedit-stage-expand">⋯</div>}
                </a>
              </ContextMenuArea>
              <div className="vedit-stage-steps">
                <SegmentsDivider step
                  onDrop={() => void this.moveSelectedStep(stage.stepSeq[0], stageIndex)}
                  onTrigger={() => void this.createStep(stage.stepSeq[0], stageIndex)} />

                {new Array(stepCount).fill(0).map((_, stepRelIndex) => {
                  let stepIndex = stage.stepSeq[0] + stepRelIndex;
                  let step = this.state.steps.get(stepIndex)!;

                  return (
                    <React.Fragment key={step.id}>
                    <ContextMenuArea onContextMenu={async (event) => {
                      await this.props.app.showContextMenu(event, [
                        { id: '_header', name: 'Protocol step', type: 'header' },
                        { id: 'delete', name: 'Delete' }
                      ], (menuPath) => {
                        if (menuPath.first() === 'delete') {
                          this.deleteStep(stepIndex);
                        }
                      });
                    }}>
                      <div className="vedit-step-item">
                        <div className="vedit-step-header">
                          <div className="vedit-step-time">00:00</div>
                          <div className="vedit-step-name">{step.name}</div>
                        </div>
                        <div className="vedit-segment-list">
                          <SegmentsDivider
                            onDrop={() => void this.moveSelected(step.seq[0], stepIndex)}
                            onTrigger={() => void this.createSegment(step.seq[0], stepIndex)} />

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
                                    {
                                      id: 'process', name: 'Process', children: [
                                        { id: 'noop', name: 'No-op' },
                                        { id: '_divider', type: 'divider' },
                                        { id: 'wait', name: 'Wait...', icon: 'hourglass-empty' },
                                        { id: 'pump', name: 'Pump...' }
                                      ]
                                    },
                                    { id: '_divider', type: 'divider' },
                                    {
                                      id: 'control', name: 'Valve control', children: [
                                        {
                                          id: 'recent', name: 'Recent', children: [
                                            { id: 'inlet1', name: 'Inlet 1' },
                                            { id: 'inlet2', name: 'Inlet 2' },
                                          ]
                                        },
                                        { id: 'clear', name: 'Clear' },
                                        {
                                          id: 'set', name: 'Set', children: [
                                            { id: 'inlet1', name: 'Inlet 1' },
                                            { id: 'inlet2', name: 'Inlet 2' },
                                          ]
                                        }
                                      ]
                                    },
                                    { id: '_divider2', type: 'divider' },
                                    { id: 'delete', name: selectedSegmentIndices.size > 1 ? `Delete ${selectedSegmentIndices.size} segments` : 'Delete', shortcut: 'X' },
                                    // { id: '_divider3', type: 'divider' },
                                    // { id: 'undo', name: 'Undo', icon: 'undo' },
                                    // { id: 'redo', name: 'Redo', icon: 'redo' },
                                  ], (menuPath) => {
                                    if (menuPath.first() === 'delete') {
                                      this.deleteSelected();
                                    }
                                  });
                                }}>
                                  <div
                                    className={util.formatClass('vedit-segment-features', {
                                      '_active': this.state.activeSegmentIndex === segmentIndex,
                                      '_selected': this.state.selectedSegmentIndices.has(segmentIndex)
                                    })}
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
                                        if (event.shiftKey && (state.activeSegmentIndex !== null)) {
                                          let added = Range(segmentIndex, state.activeSegmentIndex);

                                          return {
                                            activeSegmentIndex: segmentIndex,
                                            selectedSegmentIndices: state.selectedSegmentIndices.isSuperset(added)
                                              ? state.selectedSegmentIndices.subtract(Range(state.activeSegmentIndex, segmentIndex))
                                              : state.selectedSegmentIndices.union(added)
                                          };
                                        } else if (event.metaKey) {
                                          return {
                                            activeSegmentIndex: state.selectedSegmentIndices.has(segmentIndex)
                                              ? state.activeSegmentIndex
                                              : segmentIndex,
                                            selectedSegmentIndices: util.toggleSet(state.selectedSegmentIndices, segmentIndex)
                                          };
                                        } else {
                                          return {
                                            activeSegmentIndex: segmentIndex,
                                            selectedSegmentIndices: state.selectedSegmentIndices.clear().add(segmentIndex)
                                          };
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

                                        activeSegmentIndex: segmentIndex,
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
                                  onTrigger={() => void this.createSegment(segmentIndex + 1, stepIndex)} />
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </ContextMenuArea>

                      <SegmentsDivider step
                        onDrop={() => void this.moveSelectedStep(stepIndex + 1, stageIndex)}
                        onTrigger={() => void this.createStep(stepIndex + 1, stageIndex)} />
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}


function SegmentsDivider(props: {
  onDrop(): void;
  onTrigger?(): void;
  step?: unknown;
}) {
  let [over, setOver] = React.useState(false);

  return (
    <button type="button" className={util.formatClass(props.step ? 'vedit-step-dropzone' : 'vedit-segment-dropzone', { '_over': over })}
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
      onDragOverCapture={(event) => {
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        props.onDrop();
      }}>
      <div />
      <div>
        <Rf.Icon name="add-circle" />
        <div>{props.step ? 'Add step' : 'Add segment'}</div>
      </div>
      <div />
    </button>
  );
}
