import { Set as ImSet } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Protocol } from '../backends/common';
import { ContextMenuArea } from '../components/context-menu-area';
import * as util from '../util';


export function ProtocolOverview(props: {
  app: Rf.Application;
  protocol: Protocol;
}) {
  let [openStageIndices, setOpenStageIndices] = React.useState(ImSet([0]));

  return (
    <div className="protoview-root">
      {props.protocol.stages.map((stage, stageIndex) => (
        <div className={util.formatClass('protoview-stage-root', { '_open': openStageIndices.has(stageIndex) })} key={stageIndex}>
          <a href="#" className="protoview-stage-header" onClick={(event) => {
            event.preventDefault();
            setOpenStageIndices(util.toggleSet(openStageIndices, stageIndex));
          }}>
            <Rf.Icon name="expand-more" />
            <h3 className="protoview-stage-name">{stage.name}</h3>
            {(stage.steps.length > 0) && <div className="protoview-stage-expand">⋯</div>}
          </a>
          <div className="protoview-stage-steps">
            <div className="protoview-step-item">
              <div className="protoview-step-header">
                <div className="protoview-step-circle" />
                <div className="protoview-step-time">13:15</div>
                <div className="protoview-step-name">First step</div>
              </div>
              <button type="button" className="protoview-step-hidden">3 past steps</button>
            </div>

            {stage.steps.map((step, stepIndex) => (
              <div className="protoview-step-item" key={stepIndex}>
                <div className="protoview-step-header">
                  <div className="protoview-step-circle" />
                  <div className="protoview-step-time">13:15</div>
                  <div className="protoview-step-name">{step.name}</div>
                </div>
                <div className="protoview-segment-list">
                  {new Array(step.seq[1] - step.seq[0]).fill(0).map((_, segmentRelIndex) => {
                    let segmentIndex = step.seq[0] + segmentRelIndex;
                    let segment = props.protocol.segments[segmentIndex];
                    let features = [];

                    switch (segment.processNamespace) {
                      case 'input': {
                        features.push(['keyboard-command-key', segment.data.input!.message]);
                        break;
                      }

                      case 'timer': {
                        features.push(['hourglass-empty', formatDuration(segment.data.timer!.duration)]);
                        break;
                      }

                      default: {
                        // features.push(['⦿', 'Unknown process']);
                        break;
                      }
                    }

                    features.push(['air', 'Biotin']);
                    // features.push(['speed', '4.2 psi']);
                    // features.push(['vertical-align-bottom', 'Button']);

                    // if (segment.data.control) {
                    //   let control = segment.data.control;

                    //   if (control.valves.length > 0) {
                    //     features.push(['→', control.valves.map((valveIndex) => props.protocol.data.control!.parameters[valveIndex].label).join(', ')]);
                    //   }
                    // }

                    return (
                      <div className="protoview-segment-features">
                        {features.map(([icon, text], featureIndex) => (
                          <React.Fragment key={featureIndex}>
                            <span><Rf.Icon name={icon} /></span>
                            <span>{text}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="protoview-step-item">
              <div className="protoview-step-header">
                <div className="protoview-step-circle" />
                <div className="protoview-step-time">13:15</div>
                <div className="protoview-step-name">Done</div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


function formatDuration(input: number): string {
  if (input < 60) {
    return `${Math.floor(input)} sec`;
  } if (input < 3600) {
    let min = Math.floor(input / 60);
    let sec = Math.floor(input % 60);
    return `${min} min` + (sec > 0 ? ` ${sec} sec` : '');
  }

  return input.toString() + ' sec';
}
