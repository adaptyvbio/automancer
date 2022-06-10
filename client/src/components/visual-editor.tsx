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

  open: boolean;

  nextStage: Stage | null;
  previousStage: Stage | null;

  firstStep: Step | null;
  lastStep: Step | null;
}

export interface Step {
  id: string;
  name: string;

  stage: Stage;

  nextStep: Step | null;
  previousStep: Step | null;

  firstSegment: Segment | null;
  lastSegment: Segment | null;
}

export interface Segment {
  id: string;
  features: { icon: string; label: string; }[];

  step: Step;

  nextSegment: Segment | null;
  previousSegment: Segment | null;
}

export type Selection = {
  type: 'steps';
  activeEntry: Step;
  entries: ImSet<Step>;
} | {
  type: 'segments';
  activeEntry: Segment;
  entries: ImSet<Segment>;
};


export interface VisualEditorProps {
  draft: Draft;
}

export interface VisualEditorState {
  firstStage: Stage | null;

  drag: boolean;
  selection: Selection | null;
}


let _createSeg = () => ({
  features: [
    { icon: 'hourglass_empty', label: '20 min' },
    { icon: 'air', label: 'Biotin' }
  ]
});


export class VisualEditor extends React.Component<VisualEditorProps, VisualEditorState> {
  controller = new AbortController();
  // refSteps: Record<number, HTMLElement> = {};

  constructor(props: VisualEditorProps) {
    super(props);

    let _segments = new Array(10).fill(0).map(() => _createSeg());
    let _stages = [
      { name: 'Stage A',
        steps: [
          { name: 'Step 1', seq: [0, 3] },
          { name: 'Step 2', seq: [3, 5] }
        ] },
      { name: 'Stage B',
        steps: [
          { name: 'Step 3', seq: [5, 6] },
          { name: 'Step 4', seq: [6, 10] }
        ] }
    ];


    let currentStage: Stage | null = null;
    let currentStep: Step | null = null;
    let currentSegment: Segment | null = null;

    let firstStage: Stage | null = null;

    for (let inputStage of _stages) {
      let stage: Stage = {
        id: crypto.randomUUID(),
        name: inputStage.name,
        open: false,
        nextStage: null,
        previousStage: currentStage,
        firstStep: null,
        lastStep: null
      };

      let firstStep: Step | null = null;

      for (let inputStep of inputStage.steps) {
        let step: Step = {
          id: crypto.randomUUID(),
          name: inputStep.name,
          stage,
          nextStep: null,
          previousStep: currentStep,
          firstSegment: null,
          lastSegment: null
        };

        let firstSegment: Segment | null = null;

        for (let inputSegmentIndex of Range(inputStep.seq[0], inputStep.seq[1])) {
          let inputSegment = _segments[inputSegmentIndex];

          let segment: Segment = {
            ...inputSegment,
            id: crypto.randomUUID(),
            step,
            nextSegment: null,
            previousSegment: currentSegment
          };

          if (currentSegment) {
            currentSegment.nextSegment = segment;
          }

          currentSegment = segment;
          firstSegment ??= segment;
        }

        step.firstSegment = firstSegment;
        step.lastSegment = currentSegment;

        if (currentStep) {
          currentStep.nextStep = step;
        }

        currentStep = step;
        firstStep ??= step;
      }

      stage.firstStep = firstStep;
      stage.lastStep = currentStep;

      if (currentStage) {
        currentStage.nextStage = stage;
      }

      currentStage = stage;
      firstStage ??= stage;
    }

    this.state = {
      firstStage,

      drag: false,
      selection: null
    };

    console.log('Info ->', this.state.firstStage);
  }

  // componentDidUpdate() {
  //   console.log(this.state.selection);
  // }

  // apply(commands: any) {
  //   for (let command of commands) {
  //     switch (command.type) {
  //       case 'delete': {
  //         break;
  //       }
  //     }
  //   }
  // }

  deleteSelected() {
    this.setState((state) => {
      let selection = state.selection!;

      this.apply(selection.entries.map((entry) => (
        { type: 'delete', target: entry }
      )));

      return {
        selection: null
      };
    });
  }

  mouseSelect(event: React.MouseEvent, targetEntry: Step, targetType: 'steps', options?: { context?: boolean; }): void;
  mouseSelect(event: React.MouseEvent, targetEntry: Segment, targetType: 'segments', options?: { context?: boolean; }): void;
  mouseSelect(event: React.MouseEvent, targetEntry: any, targetType: any, options?: { context?: boolean; }) {
  // mouseSelect<T>(event: React.MouseEvent, targetEntry: T, targetType: Selection['type'], options?: { context?: boolean; }) {
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
            activeEntry: targetEntry,
            entries: (selection?.type === targetType) && selection.entries.has(targetEntry)
              ? selection.entries
              : ImSet([targetEntry])
          }
        };
      }

      if (event.shiftKey && (selection?.type === targetType)) {
        // let added = Range(targetIndex, selection.activeIndex);

        // return {
        //   selection: {
        //     type: targetType,
        //     activeIndex: targetIndex,
        //     indices: selection.indices.isSuperset(added)
        //       ? selection.indices.subtract(Range(selection.activeIndex, targetIndex))
        //       : selection.indices.union(added)
        //   } as Selection
        // };


        // 1. Assuming selection.activeEntry -> targetEntry

        let entry = selection.activeEntry;
        let entries = new Set();
        let found = false;

        do {
          entries.add(entry);

          if (entry === targetEntry) {
            found = true;
            break;
          }

          entry = entry.nextStep;
        } while (entry);


        // 2. Assuming targetEntry -> selection.activeEntry

        if (!found) {
          entry = selection.activeEntry;
          entries.clear();

          do {
            entries.add(entry);

            if (entry === targetEntry) {
              break;
            }

            entry = entry.previousStep;
          } while(entry);
        }

        return {
          selection: {
            type: targetType,
            activeEntry: targetEntry,
            entries: selection.entries.isSuperset(entries)
              ? selection.entries.subtract(entries).add(targetEntry)
              : selection.entries.union(entries)
          }
        };


        return null;
      } else if (event.metaKey && (selection?.type === targetType)) {
        let entries = util.toggleSet(selection.entries, targetEntry);

        if (entries.isEmpty()) {
          return {
            selection: null
          };
        } else {
          return {
            selection: {
              type: targetType,
              activeEntry: entries.has(targetEntry)
                ? targetEntry
                : entries.has(selection.activeEntry)
                  ? selection.activeEntry
                  : entries.first(),
              entries
            }
          };
        }
      } else {
        return {
          selection: {
            type: targetType,
            activeEntry: targetEntry,
            entries: ImSet([targetEntry])
          }
        };
      }
    });
  }

  render() {
    let selection = this.state.selection;

    function loop<T>(head: T | null, next: (item: T) => T | null): T[] {
      let item = head;
      let items = [];

      while (item) {
        items.push(item);
        item = next(item);
      }

      return items;
    }

    return (
      <div className="veditor-root">
        <div className="veditor-stage-list">
          {loop(this.state.firstStage, (stage) => stage.nextStage).map((stage) => {
            return (
              <div className={util.formatClass('veditor-stage-root', { '_open': stage.open })} key={stage.id}>
                <ContextMenuArea
                  createMenu={() => {
                    this.setState({ selection: null });

                    return [
                      { id: '_header', name: 'Protocol stage', type: 'header' },
                      { id: 'add-before', name: 'Add stage above' },
                      { id: 'add-after', name: 'Add stage below' },
                      { id: '_divider', type: 'divider' },
                      { id: 'delete', name: 'Delete', icon: 'delete' },
                    ];
                  }}
                  onSelect={(menuPath) => {
                    switch (menuPath.first()) {
                      case 'add-before': {
                        let newStage: Stage = {
                          id: crypto.randomUUID(),
                          name: 'Untitled stage',
                          open: true,
                          nextStage: stage,
                          previousStage: stage.previousStage,
                          firstStep: null,
                          lastStep: null
                        };

                        if (newStage.previousStage) {
                          newStage.previousStage.nextStage = newStage;
                        }

                        stage.previousStage = newStage;

                        if (this.state.firstStage === stage) {
                          this.setState({ firstStage: newStage });
                        } else {
                          this.forceUpdate();
                        }

                        break;
                      }

                      case 'add-after': {
                        let newStage: Stage = {
                          id: crypto.randomUUID(),
                          name: 'Untitled stage',
                          open: true,
                          nextStage: stage.nextStage,
                          previousStage: stage,
                          firstStep: null,
                          lastStep: null
                        };

                        if (newStage.nextStage) {
                          newStage.nextStage.previousStage = newStage;
                        }

                        stage.nextStage = newStage;
                        this.forceUpdate();

                        break;
                      }

                      case 'delete': {
                        if (stage.previousStage) {
                          stage.previousStage.nextStage = stage.nextStage;
                        } if (stage.nextStage) {
                          stage.nextStage.previousStage = stage.previousStage;
                        }

                        if (this.state.firstStage === stage) {
                          this.setState({ firstStage: stage.nextStage });
                        } else {
                          this.forceUpdate();
                        }

                        break;
                      }
                    }
                  }}>
                  <button type="button" className="veditor-stage-header" onClick={(event) => {
                    event.preventDefault();

                    stage.open = !stage.open;
                    this.forceUpdate();

                    // let s = structuredClone(stage);
                    // s.open = !s.open;

                    // let p = s;
                    // while (p.previousStage) p = p.previousStage;
                    // this.setState({ firstStage: p });
                  }}>
                    <div className="veditor-stage-expand"><Icon name="expand_more" /></div>
                    <h3 className="veditor-stage-name">{stage.name}</h3>
                    {stage.firstStep && <div className="veditor-stage-ellipsis">⋯</div>}
                  </button>
                </ContextMenuArea>
                <div className="veditor-stage-steps">
                  {/* <SegmentsDivider step
                  onDrop={() => void this.moveSelectedStep(stage.stepSeq[0], stageIndex)}
                  onTrigger={() => void this.createStep(stage.stepSeq[0], stageIndex)} /> */}

                  {loop(stage.firstStep, (step) => (step.nextStep?.stage === stage) ? step.nextStep : null).map((step) => {
                    let stepSelected = (selection?.type === 'steps') && selection.entries.has(step);

                    return (
                      <React.Fragment key={step.id}>
                        <ContextMenuArea
                          createMenu={(event) => {
                            this.mouseSelect(event, step, 'steps', { context: true });

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
                              '_open': true, // this.state.openStepIds.has(step.id),
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
                                this.mouseSelect(event, step, 'steps');
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
                                // if (el) {
                                //   this.refSteps[stepIndex] = el;
                                // } else {
                                //   delete this.refSteps[stepIndex];
                                // }
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

                              {/* {step.firstSegment
                                ? <div className="veditor-step-summary">{step.firstSegment.firstSegment > 1 ? `${segmentCount} segments` : 'no segment'}</div>
                                : <div className="veditor-step-preview"></div>} */}

                              <div className="veditor-segment-list">
                                <SegmentsDivider
                                  onDrop={() => void this.moveSelected(step.seq[0], stepIndex)}
                                  onTrigger={() => void this.createSegment(step.seq[0], stepIndex)} />

                                {/* {new Array(segmentCount).fill(0).map((_, segmentRelIndex) => {
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
                                })} */}
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
        {/* {(this.state.selection?.type === 'steps') && (() => {
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
        })()} */}
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
