import { List, Range, Set as ImSet } from 'immutable';
import * as React from 'react';

import type { Draft } from '../application';
import { ProtocolSeq } from '../backends/common';
import { ContextMenuArea } from './context-menu-area';
import * as util from '../util';
import { Icon } from './icon';


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

export type Selection = {
  type: 'steps';
  activeIndex: number;
  indices: ImSet<number>;
} | {
  type: 'segments';
  activeIndex: number;
  indices: ImSet<number>;
};


export interface VisualEditorProps {
  draft: Draft;
}

export interface VisualEditorState {
  stages: List<Stage>;
  steps: List<Step>;
  segments: List<Segment>;

  drag: boolean;
  selection: Selection | null;

  openStageIds: ImSet<Stage['id']>;
  openStepIds: ImSet<Step['id']>;
}


let a = () => ({
  id: crypto.randomUUID(),
  features: [
    { icon: 'hourglass_empty', label: '20 min' },
    // { icon: 'face', label: 'Alice' },
    { icon: 'air', label: 'Biotin' }
  ]
});

export class VisualEditor extends React.Component<VisualEditorProps, VisualEditorState> {
  controller = new AbortController();
  refSteps: Record<number, HTMLElement> = {};

  constructor(props: VisualEditorProps) {
    super(props);

    let x = crypto.randomUUID();
    let y = crypto.randomUUID();
    let z = crypto.randomUUID();

    this.state = {
      stages: List([
        {
          id: y,
          name: 'Stage A',
          stepSeq: [0, 2]
        },
        {
          id: z,
          name: 'Stage B',
          stepSeq: [2, 18]
        }
      ]),
      steps: List([
        { id: x, name: 'Alpha', seq: [0, 3] },
        { id: crypto.randomUUID(), name: 'Beta', seq: [3, 4] as ProtocolSeq },
        ...new Array(16).fill(0).map((_, i) => (
          { id: crypto.randomUUID(), name: 'Delta ' + i, seq: [4 + i, 5 + i] as ProtocolSeq }
        ))
      ]),
      segments: List(new Array(20).fill(0).map(a)),

      drag: false,
      selection: null,

      openStageIds: ImSet([z]),
      openStepIds: ImSet([x])
    };
  }

  componentDidMount() {
    let isStepEl = (el: HTMLElement): boolean => el.matches('.veditor-step-item');

    document.body.addEventListener('focusout', (event) => {
      // console.log('Global blur', event.target, '->', event.relatedTarget);

      // if (!isStepEl(event.target as HTMLElement) && !event.relatedTarget && (this.state.selection?.type === 'steps')) {
      //   this.refSteps[this.state.selection.activeIndex].focus({ preventScroll: true });
      // }
    }, { capture: false, signal: this.controller.signal });
  }

  componentDidUpdate(_prevProps: VisualEditorProps, prevState: VisualEditorState) {
    if (this.state.selection !== prevState.selection) {
      if (!this.state.selection && document.activeElement?.matches('.veditor-step-item')) {
        (document.activeElement as HTMLElement).blur();
      }

      if ((this.state.selection?.type === 'steps') && document.activeElement !== this.refSteps[this.state.selection.activeIndex]) {
        this.refSteps[this.state.selection.activeIndex].focus({ preventScroll: true });
      }
    }
  }

  componentWillUnmount() {
    this.controller.abort();
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
        stages: util.renumber.deleteItem(state.stages, 'stepSeq', targetStageIndex),
        steps: util.renumber.deleteRange(state.steps, 'seq', stage.stepSeq[0], stage.stepSeq[1], deletedSegmentCount),
        segments: state.segments.splice(segmentSeq[0], deletedSegmentCount),
        selection: null
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
      let selection = state.selection;

      switch (selection?.type) {
        case 'steps': {
          let deletedSegmentIndices = state.steps.flatMap((step, stepIndex) => {
            if (!selection!.indices.includes(stepIndex)) {
              return [];
            }

            return Range(step.seq[0], step.seq[1]);
          });

          return {
            stages: util.renumber.deleteChildItems(state.stages, 'stepSeq', selection.indices),
            steps: util.renumber.deleteChildItems(state.steps, 'seq', deletedSegmentIndices)
              .filter((_step, stepIndex) => !selection!.indices.includes(stepIndex)),
            segments: state.segments.filter((_segment, segmentIndex) => !deletedSegmentIndices.includes(segmentIndex)),
            selection: null
          };
        }

        case 'segments': {
          return {
            steps: util.renumber.deleteChildItems(state.steps, 'seq', selection.indices),
            segments: state.segments.filter((_segment, segmentIndex) => !selection!.indices.has(segmentIndex)),
            selection: null
          };
        }

        default: return null;
      }
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

  moveSelectedBetweenSteps(targetStageIndex: number, targetStepIndex: number) {
    this.setState((state) => {
      console.log('>>>>', targetStageIndex, targetStepIndex);

      let selection = state.selection;

      if (selection?.type === 'steps') {
        let movedSegmentIndices = selection.indices.flatMap((stepIndex) => {
          let step = state.steps.get(stepIndex)!;
          return Range(step.seq[0], step.seq[1]);
        });

        let stillSegments = state.segments.filter((_segment, segmentIndex) => !movedSegmentIndices.has(segmentIndex));
        let movedSegments = state.segments.filter((_segment, segmentIndex) => movedSegmentIndices.has(segmentIndex));

        let [stages, stepInsertionIndex] = util.renumber.moveChildItems(state.stages, 'stepSeq', selection.indices, targetStageIndex, targetStepIndex);
        let [steps, segmentInsertionIndex] = util.renumber.moveChildItems(state.steps, 'seq', movedSegmentIndices, stepInsertionIndex, state.steps.get(stepInsertionIndex)!.seq[0]); // <- !
        // console.log(state.stages.toJS(), stages.toJS(), insertionIndex);

        let stillSteps = steps.filter((_step, stepIndex) => !selection!.indices.has(stepIndex));
        let movedSteps = steps.filter((_step, stepIndex) => selection!.indices.has(stepIndex));

        // console.log(steps.toJS());

        return {
          stages,
          steps: stillSteps.splice(stepInsertionIndex, 0, ...movedSteps),
          segments: stillSegments.splice(segmentInsertionIndex, 0, ...movedSegments),
          selection: {
            type: 'steps',
            activeIndex: stepInsertionIndex,
            indices: ImSet(Range(stepInsertionIndex, stepInsertionIndex + movedSteps.size))
          }
        };
      } else {
        return null;
      }
    });
  }

  mouseSelect(event: React.MouseEvent, targetIndex: number, targetType: Selection['type'], options?: { context?: boolean; }) {
    this.setState((state) => {
      let selection = state.selection;

      // if (selection.type !== targetType) {
      //   return {
      //     selection: {
      //       type: targetType,
      //       activeIndex: targetIndex,
      //       indices: ImSet([targetIndex])
      //     }
      //   };
      // }

      if (options?.context) {
        return {
          selection: {
            type: targetType,
            activeIndex: targetIndex,
            indices: (selection?.type === targetType) && selection.indices.has(targetIndex)
              ? selection.indices
              : ImSet([targetIndex])
          }
        };
      }

      if (event.shiftKey && (selection?.type === targetType)) {
        let added = Range(targetIndex, selection.activeIndex);

        return {
          selection: {
            type: targetType,
            activeIndex: targetIndex,
            indices: selection.indices.isSuperset(added)
              ? selection.indices.subtract(Range(selection.activeIndex, targetIndex))
              : selection.indices.union(added)
          } as Selection
        };
      } else if (event.metaKey && (selection?.type === targetType)) {
        let indices = util.toggleSet(selection.indices, targetIndex);

        if (indices.isEmpty()) {
          return {
            selection: null
          };
        } else {
          return {
            selection: {
              type: targetType,
              activeIndex: indices.has(targetIndex)
                ? targetIndex
                : indices.has(selection.activeIndex)
                  ? selection.activeIndex
                  : indices.first(),
              indices
            } as Selection
          };
        }
      } else {
        return {
          selection: {
            type: targetType,
            activeIndex: targetIndex,
            indices: ImSet([targetIndex])
          } as Selection
        };
      }
    });
  }

  render() {
    // console.log(
    //   'INFO',
    //   this.state.stages.toJS(),
    //   this.state.steps.toJS(),
    //   this.state.segments.toJS()
    // );

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
      <div className="veditor-root">
        <div className="veditor-stage-list">
          {this.state.stages.map((stage, stageIndex) => {
            let stepCount = stage.stepSeq[1] - stage.stepSeq[0];

            return (
              <div className={util.formatClass('veditor-stage-root', { '_open': this.state.openStageIds.has(stage.id) })} key={stage.id}>
                <ContextMenuArea
                  createMenu={() => {
                    this.setState({ selection: null });

                    return [
                      { id: '_header', name: 'Protocol stage', type: 'header' },
                      { id: 'add-above', name: 'Add stage above' },
                      { id: 'add-below', name: 'Add stage below' },
                      { id: '_divider', type: 'divider' },
                      { id: 'delete', name: 'Delete', icon: 'delete' },
                    ];
                  }}
                  onSelect={(menuPath) => {
                    switch (menuPath.first()) {
                      case 'add-above': {
                        let newStage = {
                          id: crypto.randomUUID(),
                          name: 'Untitled stage',
                          stepSeq: [stage.stepSeq[0], stage.stepSeq[0]] as ProtocolSeq
                        };

                        this.setState((state) => ({
                          openStageIds: state.openStageIds.add(newStage.id),
                          stages: state.stages.insert(stageIndex, newStage)
                        }));

                        break;
                      }

                      case 'add-below': {
                        let newStage = {
                          id: crypto.randomUUID(),
                          name: 'Untitled stage',
                          stepSeq: [stage.stepSeq[1], stage.stepSeq[1]] as ProtocolSeq
                        };

                        this.setState((state) => ({
                          openStageIds: state.openStageIds.add(newStage.id),
                          stages: state.stages.insert(stageIndex + 1, newStage)
                        }));

                        break;
                      }

                      case 'delete': {
                        this.deleteStage(stageIndex);
                        break;
                      }
                    }
                  }}>
                  <button type="button" className="veditor-stage-header" onClick={(event) => {
                    event.preventDefault();

                    this.setState((state) => ({
                      openStageIds: util.toggleSet(state.openStageIds, stage.id)
                    }));
                  }}>
                    <div className="veditor-stage-expand"><Icon name="expand_more" /></div>
                    <h3 className="veditor-stage-name">{stage.name}</h3>
                    {(stepCount > 0) && <div className="veditor-stage-ellipsis">⋯</div>}
                  </button>
                </ContextMenuArea>
                <div className="veditor-stage-steps">
                  {/* <SegmentsDivider step
                  onDrop={() => void this.moveSelectedStep(stage.stepSeq[0], stageIndex)}
                  onTrigger={() => void this.createStep(stage.stepSeq[0], stageIndex)} /> */}

                  {new Array(stepCount).fill(0).map((_, stepRelIndex) => {
                    let stepIndex = stage.stepSeq[0] + stepRelIndex;
                    let step = this.state.steps.get(stepIndex)!;
                    let stepSelected = (selection?.type === 'steps') && selection.indices.has(stepIndex);
                    let segmentCount = step.seq[1] - step.seq[0];

                    return (
                      <React.Fragment key={step.id}>
                        <ContextMenuArea
                          createMenu={(event) => {
                            this.mouseSelect(event, stepIndex, 'steps', { context: true });

                            return [
                              { id: '_header', name: 'Protocol step', type: 'header' },
                              { id: 'add-above', name: 'Add step above' },
                              { id: 'add-below', name: 'Add step below' },
                              { id: '_divider', type: 'divider' },
                              { id: 'delete', name: 'Delete', icon: 'delete' }
                            ];
                          }}
                          onSelect={(menuPath) => {
                            switch (menuPath.first()) {
                              case 'add-above': {
                                let newStep = {
                                  id: crypto.randomUUID(),
                                  name: 'Untitled step',
                                  seq: [step.seq[0], step.seq[0]] as ProtocolSeq
                                };

                                this.setState((state) => ({
                                  openStepIds: state.openStepIds.add(newStep.id),
                                  stages: util.renumber.createChildItem(state.stages, 'stepSeq', stageIndex),
                                  steps: state.steps.insert(stepIndex, newStep),
                                  selection: {
                                    type: 'steps',
                                    activeIndex: stepIndex,
                                    indices: ImSet([stepIndex])
                                  }
                                }));

                                break;
                              }

                              case 'add-below': {
                                let newStep = {
                                  id: crypto.randomUUID(),
                                  name: 'Untitled step',
                                  seq: [step.seq[1], step.seq[1]] as ProtocolSeq
                                };

                                this.setState((state) => ({
                                  openStepIds: state.openStepIds.add(newStep.id),
                                  stages: util.renumber.createChildItem(state.stages, 'stepSeq', stageIndex),
                                  steps: state.steps.insert(stepIndex + 1, newStep)
                                }));

                                break;
                              }

                              case 'delete':
                                this.deleteSelected();
                                break;
                            }
                          }}>
                          <div
                            className={util.formatClass('veditor-step-item', {
                              '_open': this.state.openStepIds.has(step.id),
                              '_selected': stepSelected
                            })}
                            draggable
                            onDragEnd={() => {
                              this.setState({ drag: false });
                            }}
                            onDragStart={(event) => {
                              event.dataTransfer.setData('text/plain', JSON.stringify({ sourceId: step.id }));

                              this.mouseSelect(event, stepIndex, 'steps', { context: true });
                              this.setState({ drag: true });
                            }}
                            // onDoubleClick={(event) => {
                            //   event.preventDefault();

                            //   this.setState((state) => ({
                            //     openStepIds: util.toggleSet(state.openStepIds, step.id)
                            //   }));
                            // }}
                            >
                            <button type="button"
                              className="veditor-step-handle"
                              onBlur={(event) => {
                                // console.log('Item blur', event.target, '->', event.relatedTarget);
                                if (stepSelected && !event.relatedTarget) {
                                  this.setState({ selection: null });
                                }
                              }}
                              // Necessary for if the tab comes into the background
                              // onFocus={(event) => {
                              //   if (!stepSelected && (event.currentTarget === event.target)) {
                              //     event.currentTarget.blur();
                              //   }
                              // }}
                              onClick={(event) => {
                                event.preventDefault();
                                this.mouseSelect(event, stepIndex, 'steps');
                              }}
                              onKeyDown={(event) => {
                                switch (event.key) {
                                  case 'Backspace':
                                    this.deleteSelected();
                                    break;
                                  case 'Escape':
                                    event.currentTarget.blur();
                                    break;
                                  default:
                                    return;
                                }

                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              ref={(el) => {
                                if (el) {
                                  this.refSteps[stepIndex] = el;
                                } else {
                                  delete this.refSteps[stepIndex];
                                }
                              }} />
                            <div className="veditor-step-body">
                              <div className="veditor-step-time">00:00</div>
                              <div className="veditor-step-name">{step.name}</div>

                              <button type="button" className="veditor-step-expand veditor-step-expand--open"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  this.setState((state) => ({ openStepIds: state.openStepIds.add(step.id) }));
                                }}>
                                <div>Open</div>
                                <Icon name="expand_more" />
                              </button>

                              <button type="button" className="veditor-step-expand veditor-step-expand--close" onClick={(event) => {
                                event.stopPropagation();
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
                                            if (!event.relatedTarget?.classList.contains('veditor-segment-features') && !event.relatedTarget?.classList.contains('cmenu-root')) {
                                              this.setState((_state) => ({ selection: null }));
                                            }
                                          }}
                                          onKeyDown={(event) => {
                                            switch (event.key) {
                                              case 'Backspace':
                                                this.deleteSelected();
                                                break;
                                              case 'Escape':
                                                event.currentTarget.blur();
                                                break;
                                              default:
                                                return;
                                            }

                                            event.preventDefault();
                                            event.stopPropagation();
                                          }}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();

                                            this.mouseSelect(event, segmentIndex, 'segments');
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

                        <StepDivider
                          active={this.state.drag}
                          onDrop={() => {
                            this.moveSelectedBetweenSteps(stageIndex, stepIndex + 1);
                          }} />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {(this.state.selection?.type === 'steps') && (() => {
          let steps = this.state.selection.indices.toArray().map((stepIndex) => this.state.steps.get(stepIndex)!);
          let commonStepName = util.findCommon(steps.map((step) => step.name));

          let setName = (name: string) => {
            this.setState((state) => ({
              steps: state.steps.map((step, stepIndex) =>
                this.state.selection!.indices.has(stepIndex)
                  ? { ...step, name }
                  : step
              )
            }));
          };

          return (
            <div className="veditor-inspector-root">
              <div className="veditor-inspector-header">
                <div className="veditor-inspector-subtitle">{(steps.length <= 1) ? 'Step' : `${steps.length} steps`}</div>
                <input
                  className={util.formatClass('veditor-inspector-title', { '_mixed': (commonStepName === null) })}
                  value={commonStepName ?? ''}
                  placeholder={(commonStepName === null) ? 'Mixed' : 'Step title'}
                  onFocus={() => {
                    if (commonStepName === null) {
                      setName('');
                    }
                  }}
                  onInput={(event) => {
                    setName(event.currentTarget.value);
                  }} />
                <div className="veditor-inspector-navigation">
                  <button type="button" className="veditor-inspector-navigate" disabled>
                    <Icon name="chevron_left" />
                  </button>
                  <button type="button" className="veditor-inspector-navigate">
                    <Icon name="chevron_right" />
                  </button>
                </div>
              </div>

              <div className="veditor-inspector-section">Process</div>
              <div className="veditor-inspector-form">
                <Inspector.TextField label="Name" placeholder="e.g. Bob" />
                <Inspector.Select label="Mode">
                  <option>No-op</option>
                  <option>Timer</option>
                  <option>Pump forward</option>
                  <option>Pump backward</option>
                </Inspector.Select>
                <Inspector.DurationField label="Duration" />
              </div>

              <div className="veditor-inspector-section">Valve control</div>

              <div className="veditor-inspector-form">
                <Inspector.CheckboxList label="Closed valves">
                  <Inspector.Checkbox label="Button" />
                  <Inspector.Checkbox label="Outlet" />
                  <Inspector.Checkbox label="Foo" />
                </Inspector.CheckboxList>

                <Inspector.Select label="Mode">
                  <option>No-op</option>
                  <option>Timer</option>
                  <option>Pump forward</option>
                  <option>Pump backward</option>
                </Inspector.Select>
                <Inspector.Select label="Mode">
                  <option>Forward</option>
                  <option>Backward</option>
                </Inspector.Select>
                <Inspector.TextField label="Name" placeholder="e.g. Bob" />
                <Inspector.DurationField label="Duration" />
              </div>
            </div>
          );
        })()}
      </div>
    );
  }
}


namespace Inspector {
  export function Checkbox(props: {
    label: string;
  }) {
    return (
      <label className="veditor-inspector-checkbox">
        <input type="checkbox" />
        <div>{props.label}</div>
      </label>
    );
  }

  export function CheckboxList(props: React.PropsWithChildren<{
    label: string;
  }>) {
    return (
      <div className="veditor-inspector-group">
        <div className="veditor-inspector-label">{props.label}</div>
        <div className="veditor-inspector-checkboxlist">
          {props.children}
        </div>
      </div>
    );
  }

  export function DurationField(props: React.PropsWithChildren<{
    label: string;
  }>) {
    return (
      <div className="veditor-inspector-group">
        <div className="veditor-inspector-label">{props.label}</div>
        <div className="veditor-inspector-durationfield">
          <label>
            <input type="text" placeholder="0" />
            <div>hrs</div>
          </label>
          <label>
            <input type="text" placeholder="0" />
            <div>min</div>
          </label>
          <label>
            <input type="text" placeholder="0" />
            <div>sec</div>
          </label>
          <label>
            <input type="text" placeholder="0" />
            <div>ms</div>
          </label>
        </div>
      </div>
    );
  }

  export function Select(props: React.PropsWithChildren<{
    label: string;
  }>) {
    return (
      <label className="veditor-inspector-group">
        <div className="veditor-inspector-label">{props.label}</div>
        <div className="veditor-inspector-select">
          <select>
            {props.children}
          </select>
          <Icon name="expand_more" />
        </div>
      </label>
    );
  }

  export function TextField(props: {
    label: string;
    placeholder: string;
  }) {
    return (
      <label className="veditor-inspector-group">
        <div className="veditor-inspector-label">{props.label}</div>
        <input type="text" className="veditor-inspector-textfield" placeholder={props.placeholder} />
      </label>
    );
  }
}


function StepDivider(props: {
  active: boolean;
  onDrop(): void;
}) {
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
        props.onDrop();
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
