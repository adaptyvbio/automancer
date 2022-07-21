import * as React from 'react';

import { Diagram } from './diagram';
import type { Host, Route } from '../application';
import { Chip, ChipId, ControlNamespace } from '../backends/common';
import { namespace as vcNamespace } from '../units/control';
import { namespace as mfNamespace } from '../units/microfluidics';
import { Pool } from '../util';
import * as util from '../util';


export interface ChipControlProps {
  chipId: ChipId;
  host: Host;
}

export interface ChipControlState {
  targetChannelIndex: number | null;
}

export class ChipControl extends React.Component<ChipControlProps, ChipControlState> {
  pool = new Pool();

  constructor(props: ChipControlProps) {
    super(props);

    this.state = {
      targetChannelIndex: null
    };
  }

  get chip(): Chip {
    return this.props.host.state.chips[this.props.chipId];
  }

  render() {
    let mfMatrix = this.chip.matrices[mfNamespace];
    let model = (mfMatrix.modelId !== null)
      ? this.props.host.state.executors[mfNamespace].models[mfMatrix.modelId]
      : null;

    // console.log(model);
    // console.log(matrix, sheet, runner);

    if (!model) {
      return <></>;
    }

    let runner = this.chip.runners[vcNamespace]
    let signal = BigInt(runner.signal);
    let vcMatrix = this.chip.matrices[vcNamespace];

    return (
      <div className="blayout-contents">
        {model.diagram && (
          <>
            <div className="header header--2">
              <h2>Diagram</h2>
            </div>
            <div>
              <Diagram
                model={model}
                signal={signal}
                targetChannelIndex={this.state.targetChannelIndex} />
            </div>
          </>
        )}

        <div className="header header--2">
          <h2>Manual control</h2>
        </div>

        <div className="mcontrol-root">
          {model.groups.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
              <div className="mcontrol-group">
                <h3 className="mcontrol-group-title">{group.label}</h3>
                <div className="mcontrol-group-entries">
                  {group.channelIndices.map((channelIndex) => {
                    let channel = model!.channels[channelIndex];
                    let active = ((1n << BigInt(channelIndex)) & signal) > 0;
                    let modelValveMask = 1n << BigInt(channelIndex);
                    let status = runner.valves[channelIndex];

                      let icon = {
                        'barrier': 'vertical_align_center',
                        'flow': 'air',
                        'isolate': 'view_column',
                        'move': 'moving',
                        'push': 'download'
                      }[channel.repr];

                      return (
                        <div
                          className={util.formatClass('mcontrol-entry', { '_on': active })}
                          key={channel.id}
                          onMouseEnter={() => {
                            this.setState({ targetChannelIndex: channelIndex });
                          }}
                          onMouseLeave={() => {
                            this.setState({ targetChannelIndex: null });
                          }}>
                          <div className="mcontrol-icon">
                            <span className="material-symbols-rounded">{icon}</span>
                          </div>
                          <div className="mcontrol-label">{channel.label ?? `Channel ${channelIndex}`}</div>
                          <div className="mcontrol-sublabel">{channel.id}</div>
                          <div className="mcontrol-statuses">
                            {(status.error !== null) && (
                              <div className="mcontrol-status mcontrol-status--warning">
                                <div className="mcontrol-status-icon">
                                  <span className="material-symbols-rounded">error</span>
                                </div>
                                <div className="mcontrol-status-label">{ControlNamespace.RunnerValveError[status.error]}</div>
                              </div>
                            )}
                          </div>
                          <div className="mcontrol-switches">
                            <button type="button" className="mcontrol-switch" onClick={() => {
                              this.props.host.backend.command(this.chip.id, {
                                control: {
                                  type: 'signal',
                                  signal: String((signal! & ~modelValveMask) | (modelValveMask * BigInt(active ? 0 : 1)))
                                }
                              });
                            }}>
                              <div className="mcontrol-switch-icon">
                                <span className="material-symbols-rounded">{icon}</span>
                              </div>
                              <div className="mcontrol-switch-label">{active ? 'On' : 'Off'}</div>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
}
