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
            {stage.steps.map((step, stepIndex) => (
              <div className="protoview-step-item" key={stepIndex}>
                <div className="protoview-step-header">
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
                        features.push(['⌘', segment.data.input!.message]);
                        break;
                      }

                      case 'timer': {
                        features.push(['⧖', formatDuration(segment.data.timer!.duration)]);
                        break;
                      }

                      default: {
                        features.push(['⦿', 'Unknown process']);
                        break;
                      }
                    }

                    if (segment.data.control) {
                      let control = segment.data.control;

                      if (control.valves.length > 0) {
                        features.push(['→', control.valves.map((valveIndex) => props.protocol.data.control!.parameters[valveIndex].label).join(', ')]);
                      }
                    }

                    return (
                      <React.Fragment key={segmentRelIndex}>
                        <ContextMenuArea onContextMenu={(event) => {
                          return props.app.showContextMenu(event, [
                            { id: 'header', name: 'Protocol step', type: 'header' },
                            { id: 'notify', name: 'Add notification' }
                          ], (menuPath) => {

                          });
                        }} key={stepIndex}>
                          <div className="protoview-segment-features" style={{ gridRow: segmentRelIndex + 1 }}>
                            {features.map(([symbol, text], featureIndex) => (
                              <React.Fragment key={featureIndex}>
                                <span>{symbol}</span>
                                <span>{text}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        </ContextMenuArea>
                        <button type="button" className="protoview-segment-divider" style={{ gridRow: segmentRelIndex + 1 }}>
                          <span></span>
                          <span>Add segment</span>
                          <span></span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
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
