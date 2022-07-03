import { Set as ImSet } from 'immutable';
import * as React from 'react';
import seqOrd from 'seq-ord';

import type { Plan } from './draft-overview';
import { Icon } from './icon';
import { formatAbsoluteTime, formatDuration, formatRelativeTime } from '../format';
import { type Analysis, analyzeProtocol } from '../analysis';
import type { Master, MasterEntry, Protocol, ProtocolLocation } from '../backends/common';
// import { ContextMenuArea } from '../components/context-menu-area';
import * as util from '../util';
import { Units } from '../units';


export function ProtocolOverview(props: {
  analysis?: Analysis;
  location?: Plan['location'];
  master?: Master;
  protocol: Protocol;
  setLocation?(location: ProtocolLocation): void;
}) {
  let [openStageIndices, setOpenStageIndices] = React.useState(ImSet<number>(props.protocol.stages.map((_, index) => index)));
  let analysis = props.analysis ?? analyzeProtocol(props.protocol);
  let currentSegmentIndex = (analysis.current
    ? analysis.current.segmentIndex
    : props.location?.segmentIndex) ?? null;

  let formatTime = props.master
    ? formatAbsoluteTime
    : formatRelativeTime;

  return (
    <div className="poverview-root">
      {props.protocol.stages.map((stage, stageIndex) => {
        let nextStage = props.protocol.stages[stageIndex + 1];
        let nextStageSegmentAnalysis = nextStage && analysis.segments[nextStage.seq[0]];

        let hidden = true;
        let isCurrentStage = (currentSegmentIndex !== null) && (currentSegmentIndex >= stage.seq[0]) && (currentSegmentIndex < stage.seq[1]);
        let currentStepIndex = isCurrentStage ? stage.steps.findIndex((step) => (step.seq[0] <= currentSegmentIndex!) && (step.seq[1] > currentSegmentIndex!))! : null;

        return (
          <div className={util.formatClass('poverview-stage-root', {
            '_active': isCurrentStage,
            '_open': openStageIndices.has(stageIndex)
          })} key={stageIndex}>
            <a href="#" className="poverview-stage-header" onClick={(event) => {
              event.preventDefault();
              setOpenStageIndices(util.toggleSet(openStageIndices, stageIndex));
            }}>
              <div className="poverview-stage-expand">
                <Icon name="expand_more" />
              </div>
              <h3 className="poverview-stage-name">{stage.name}</h3>
              {(stage.steps.length > 0) && <div className="poverview-stage-ellipsis">⋯</div>}
            </a>
            <div className="poverview-stage-steps">
              {stage.steps.map((step, stepIndex) => {
                let firstSegmentAnalysis = analysis.segments[step.seq[0]];
                let isStepHidden = false;
                // let isStepHidden = isCurrentStage && hidden && (step.seq[1] <= currentSegmentIndex!);

                if (isStepHidden && (stepIndex > 0)) {
                  return null;
                }

                return (
                  <div className="poverview-step-item" key={stepIndex}>
                    <div className="poverview-step-header">
                      <div className="poverview-step-marker" />
                      <div className="poverview-step-time">{firstSegmentAnalysis.timeRange ? formatTime(firstSegmentAnalysis.timeRange[0]) : '–'}</div>
                      <div className="poverview-step-name">{step.name}</div>
                    </div>
                    {!isStepHidden
                      ? (
                        <div className="poverview-segment-list">
                          {new Array(step.seq[1] - step.seq[0]).fill(0).map((_, segmentRelIndex) => {
                            let segmentIndex = step.seq[0] + segmentRelIndex;
                            let segment = props.protocol.segments[segmentIndex];
                            let operatorNamespace = segment.processNamespace;

                            let features = Units
                              .sort(seqOrd(function* ([aNamespace, _aUnit], [bNamespace, _bUnit], rules) {
                                yield rules.binary(bNamespace === operatorNamespace, aNamespace === operatorNamespace);
                              }))
                              .flatMap(([namespace, Unit]) => {
                                return Unit.createFeatures?.({
                                  location: props.location,
                                  protocol: props.protocol,
                                  segment,
                                  segmentIndex
                                }) ?? [];
                              });

                            return (
                              <button type="button"
                                className={util.formatClass('poverview-segment-features', { '_active': segmentIndex === currentSegmentIndex })}
                                key={segmentRelIndex}
                                onClick={() => {
                                  props.setLocation?.({
                                    data: null,
                                    segmentIndex
                                  });
                                }}>
                                {features.map((feature, featureIndex) => (
                                  <React.Fragment key={featureIndex}>
                                    <div className="poverview-feature-icon"><Icon name={feature.icon} /></div>
                                    <div className="poverview-feature-label">{feature.label}</div>
                                  </React.Fragment>
                                ))}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <button type="button" className="poverview-step-hidden">{currentStepIndex!} past steps</button>
                      )
                    }
                  </div>
                );
              })}
              <div className="poverview-step-item">
                <div className="poverview-step-header">
                  <div className="poverview-step-marker" />
                  <div className="poverview-step-time">
                    {nextStageSegmentAnalysis
                      ? (nextStageSegmentAnalysis.timeRange ? formatTime(nextStageSegmentAnalysis.timeRange[0]) : '–')
                      : formatTime(analysis.done.time)}
                  </div>
                  <div className="poverview-step-name">{nextStage ? `Continuing to ${nextStage.name}` : 'Done'}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
