import { List, Set as ImSet } from 'immutable';
import * as React from 'react';

import type { Draft } from '../application';
import { ProtocolSeq } from '../backends/common';
import * as util from '../util';
import { Icon } from './icon';


function ContextMenuArea(props: React.PropsWithChildren<{}>) {
  return props.children;
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
  draft: Draft;
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
  openStepIds: ImSet<Step['id']>;

  selection: {
    type: 'steps';
    activeIndex: number;
    indices: ImSet<number>;
  } | {
    type: 'segments';
    activeIndex: number;
    indices: ImSet<number>;
  } | null;
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

    let x = crypto.randomUUID();

    this.state = {
      stages: List([
        { id: crypto.randomUUID(),
          name: 'Stage A',
          stepSeq: [0, 2] },
        { id: crypto.randomUUID(),
          name: 'Stage B',
          stepSeq: [2, 18] }
      ]),
      steps: List([
        { id: x, name: 'Alpha', seq: [0, 3] },
        { id: crypto.randomUUID(), name: 'Beta', seq: [3, 4] as ProtocolSeq },
        ...new Array(16).fill(0).map((_, i) => (
          { id: crypto.randomUUID(), name: 'Delta', seq: [4 + i, 5 + i] as ProtocolSeq }
        ))
      ]),
      segments: List(new Array(20).fill(0).map(a)),

      drag: null,

      openStageIndices: ImSet([0]),
      openStepIds: ImSet([x]),

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


    let selection = this.state.selection;

    return (
      <div className="protoview-root veditor-root">
        {this.state.stages.map((stage, stageIndex) => {
          let stepCount = stage.stepSeq[1] - stage.stepSeq[0];

          return (
            <div className={util.formatClass('veditor-stage-root', { '_open': this.state.openStageIndices.has(stageIndex) })} key={stage.id}>
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
                <a href="#" className="veditor-stage-header" onClick={(event) => {
                  event.preventDefault();

                  this.setState((state) => ({
                    openStageIndices: util.toggleSet(state.openStageIndices, stageIndex)
                  }));
                }}>
                  <div className="veditor-stage-expand"><Icon name="expand_more" /></div>
                  <h3 className="veditor-stage-name">{stage.name}</h3>
                  {(stepCount > 0) && <div className="veditor-stage-ellipsis">⋯</div>}
                </a>
              </ContextMenuArea>
              <div className="veditor-stage-steps">
                {/* <SegmentsDivider step
                  onDrop={() => void this.moveSelectedStep(stage.stepSeq[0], stageIndex)}
                  onTrigger={() => void this.createStep(stage.stepSeq[0], stageIndex)} /> */}

                {new Array(stepCount).fill(0).map((_, stepRelIndex) => {
                  let stepIndex = stage.stepSeq[0] + stepRelIndex;
                  let step = this.state.steps.get(stepIndex)!;
                  let segmentCount = step.seq[1] - step.seq[0];

                  return (
                    <React.Fragment key={step.id}>
                      <ContextMenuArea onContextMenu={async (event) => {
                        let selectedStepIndices = (selection?.type === 'steps') && selection.indices.has(stepIndex)
                          ? selection.indices
                          : ImSet([stepIndex]);

                        this.setState({
                          selection: {
                            type: 'steps',
                            activeIndex: stepIndex,
                            indices: selectedStepIndices
                          }
                        });

                        await this.props.app.showContextMenu(event, [
                          { id: '_header', name: 'Protocol step', type: 'header' },
                          { id: 'delete', name: 'Delete' }
                        ], (menuPath) => {
                          if (menuPath.first() === 'delete') {
                            this.deleteStep(stepIndex);
                          }
                        });
                      }}>
                        <div className={util.formatClass('veditor-step-item', {
                          '_open': this.state.openStepIds.has(step.id),
                          '_selected': (selection?.type === 'steps') && selection.indices.has(stepIndex)
                        })}
                          onDoubleClick={(event) => {
                            event.preventDefault();

                            this.setState((state) => ({
                              openStepIds: util.toggleSet(state.openStepIds, step.id)
                            }));
                          }}>
                          <div className="veditor-step-time">00:00</div>
                          <div className="veditor-step-name">{step.name}</div>
                          {/* <div className="veditor-step-info"> */}
                          {/* <div className="veditor-step-segment"></div> */}
                          {/* </div> */}

                          <button type="button" className="veditor-step-expand veditor-step-expand--open" onClick={() => {
                            this.setState((state) => ({ openStepIds: state.openStepIds.add(step.id) }));
                          }}>
                            <div>Open</div>
                            <Icon name="expand_more" />
                          </button>

                          <button type="button" className="veditor-step-expand veditor-step-expand--close" onClick={() => {
                            this.setState((state) => ({ openStepIds: state.openStepIds.delete(step.id) }));
                          }}>
                            <div>Close</div>
                            <Icon name="expand_less" />
                          </button>

                          {segmentCount !== 1
                            ? <div className="veditor-step-summary">{segmentCount > 1 ? `${segmentCount} segments` : 'no segment'}</div>
                            : <div className="veditor-step-preview"></div>}

                          <div className="veditor-segment-list">
                            <SegmentsDivider
                              onDrop={() => void this.moveSelected(step.seq[0], stepIndex)}
                              onTrigger={() => void this.createSegment(step.seq[0], stepIndex)} />

                            {new Array(segmentCount).fill(0).map((_, segmentRelIndex) => {
                              let segmentIndex = step.seq[0] + segmentRelIndex;
                              let segment = this.state.segments.get(segmentIndex)!;

                              return (
                                <React.Fragment key={segment.id}>
                                  <ContextMenuArea onContextMenu={async (event) => {
                                    event.stopPropagation();

                                    let selectedSegmentIndices = (selection?.type === 'segments') && selection.indices.has(segmentIndex)
                                      ? selection.indices
                                      : ImSet([segmentIndex]);

                                    this.setState({
                                      selection: {
                                        type: 'segments',
                                        activeIndex: segmentIndex,
                                        indices: selectedSegmentIndices
                                      }
                                    });

                                    await this.props.app.showContextMenu(event, [
                                      { id: '_header', name: 'Protocol segment', type: 'header' },
                                      // {
                                      //   id: 'process', name: 'Process', children: [
                                      //     { id: 'noop', name: 'No-op' },
                                      //     { id: '_divider', type: 'divider' },
                                      //     { id: 'wait', name: 'Wait...', icon: 'hourglass-empty' },
                                      //     { id: 'pump', name: 'Pump...' }
                                      //   ]
                                      // },
                                      // { id: '_divider', type: 'divider' },
                                      // {
                                      //   id: 'control', name: 'Valve control', children: [
                                      //     {
                                      //       id: 'recent', name: 'Recent', children: [
                                      //         { id: 'inlet1', name: 'Inlet 1' },
                                      //         { id: 'inlet2', name: 'Inlet 2' },
                                      //       ]
                                      //     },
                                      //     { id: 'clear', name: 'Clear' },
                                      //     {
                                      //       id: 'set', name: 'Set', children: [
                                      //         { id: 'inlet1', name: 'Inlet 1' },
                                      //         { id: 'inlet2', name: 'Inlet 2' },
                                      //       ]
                                      //     }
                                      //   ]
                                      // },
                                      // { id: '_divider2', type: 'divider' },
                                      { id: 'delete', name: selectedSegmentIndices.size > 1 ? `Delete ${selectedSegmentIndices.size} segments` : 'Delete' }
                                    ], (menuPath) => {
                                      if (menuPath.first() === 'delete') {
                                        this.deleteSelected();
                                      }
                                    }, (selected) => {
                                      if (!selected) {
                                        this.setState((_state) => ({ selection: null }));
                                      }
                                    });
                                  }}>
                                    <div
                                      className={util.formatClass('veditor-segment-features', {
                                        '_active': (this.state.selection?.type === 'segments') && this.state.selection.activeIndex === segmentIndex,
                                        '_selected': (this.state.selection?.type === 'segments') && this.state.selection.indices.has(segmentIndex)
                                      })}
                                      key={segment.id}
                                      draggable
                                      tabIndex={-1}
                                      onBlur={(event) => {
                                        if (!event.relatedTarget?.classList.contains('veditor-segment-features') && !event.relatedTarget?.classList.contains('ctxmenu')) {
                                          this.setState((_state) => ({ selection: null }));
                                        }
                                      }}
                                      onKeyDown={(event) => {
                                        switch (event.key) {
                                          case 'Backspace': {
                                            this.deleteSelected();
                                            break;
                                          }

                                          case 'Escape': {
                                            this.setState((_state) => ({ selection: null }));
                                            break;
                                          }

                                          default: return;
                                        }

                                        event.preventDefault();
                                      }}
                                      onClick={(event) => {
                                        this.setState((state) => {
                                          let selection = state.selection;

                                          if (event.shiftKey && (selection?.type === 'segments')) {
                                            let added = Range(segmentIndex, selection.activeIndex);

                                            return {
                                              selection: {
                                                type: 'segments',
                                                activeIndex: segmentIndex,
                                                indices: selection.indices.isSuperset(added)
                                                  ? selection.indices.subtract(Range(selection.activeIndex, segmentIndex))
                                                  : selection.indices.union(added)
                                              }
                                            };
                                          } else if (event.metaKey && (selection?.type === 'segments')) {
                                            return {
                                              selection: {
                                                type: 'segments',
                                                activeIndex: selection.indices.has(segmentIndex)
                                                  ? selection.activeIndex
                                                  : segmentIndex,
                                                indices: util.toggleSet(selection.indices, segmentIndex)
                                              }
                                            };
                                          } else {
                                            return {
                                              selection: {
                                                type: 'segments',
                                                activeIndex: segmentIndex,
                                                indices: ImSet([segmentIndex])
                                              }
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
                                          <Icon name={feature.icon} />
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

                      {/* <SegmentsDivider step
                        onDrop={() => void this.moveSelectedStep(stepIndex + 1, stageIndex)}
                        onTrigger={() => void this.createStep(stepIndex + 1, stageIndex)} /> */}

                      {/* <div className="veditor-step-dropzone">
                        <Rf.Icon name="chevron-right" />
                        <div />
                        <Rf.Icon name="chevron-left" />
                      </div> */}

                      <StepDivider active={this.state.drag !== null} />
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


function StepDivider(props: { active: boolean; }) {
  let [over, setOver] = React.useState(false);

  return (
    <div className={util.formatClass('veditor-step-dropzone', { '_active': props.active, '_over': over })}
      // onClick={props.onTrigger}
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
        // props.onDrop();
      }}>
      <Icon name="chevron_right" />
      <div />
      <Icon name="chevron_left" />
    </div>
  );
}

function SegmentsDivider(props: {
  onDrop(): void;
  onTrigger?(): void;
  step?: unknown;
}) {
  let [over, setOver] = React.useState(false);

  return (
    <button type="button" className={util.formatClass(props.step ? 'veditor-step-dropzone' : 'veditor-segment-dropzone', { '_over': over })}
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
        <Icon name="add_circle" />
        <div>{props.step ? 'Add step' : 'Add segment'}</div>
      </div>
      <div />
    </button>
  );
}
