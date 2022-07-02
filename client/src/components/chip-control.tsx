import * as React from 'react';

import type { Host, Route } from '../application';
import { Chip, ChipId, ChipModel, ControlNamespace } from '../backends/common';
import { Diagram } from './diagram';
import { Pool } from '../util';
import * as util from '../util';


export interface ChipControlProps {
  chipId: ChipId;
  host: Host;
}

export interface ChipControlState {
  targetValveIndex: number | null;
}

export class ChipControl extends React.Component<ChipControlProps, ChipControlState> {
  pool = new Pool();

  constructor(props: ChipControlProps) {
    super(props);

    this.state = {
      targetValveIndex: null
    };
  }

  get chip(): Chip {
    return this.props.host.state.chips[this.props.chipId];
  }

  get model(): ChipModel {
    return this.props.host.state.models[this.chip.modelId];
  }

  render() {
    let matrix = this.chip.matrices.control;
    let sheet = this.model.sheets.control;
    let runner = this.chip.runners.control;
    let signal = BigInt(runner.signal);

    // console.log(matrix, sheet, runner);

    return (
      <div className="blayout-contents">
        {sheet.diagram && (
          <>
            <div className="header header--2">
              <h2>Diagram</h2>
            </div>
            <div>
              <Diagram
                sheet={sheet}
                signal={signal}
                targetValveIndex={this.state.targetValveIndex} />
            </div>
          </>
        )}

        <div className="header header--2">
          <h2>Manual control</h2>
        </div>

        <div className="mcontrol-root">
          {sheet.groups.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
              <div className="mcontrol-group">
                <h3 className="mcontrol-group-title">{group.name}</h3>
                <div className="mcontrol-group-entries">
                  {Array.from(sheet.valves.entries())
                    .filter(([_valveIndex, valve]) => valve.group === groupIndex)
                    .map(([valveIndex, valve]) => {
                      let active = ((1n << BigInt(valveIndex)) & signal) > 0;
                      let modelValveMask = 1n << BigInt(valveIndex);
                      let status = runner.valves[valveIndex];

                      let icon = {
                        'barrier': 'vertical_align_center',
                        'flow': 'air',
                        'isolate': 'view_column',
                        'move': 'moving',
                        'push': 'download'
                      }[valve.repr];

                      return (
                        <div
                          className={util.formatClass('mcontrol-entry', { '_on': active })}
                          key={valve.id}
                          onMouseEnter={() => {
                            this.setState({ targetValveIndex: valveIndex });
                          }}
                          onMouseLeave={() => {
                            this.setState({ targetValveIndex: null });
                          }}>
                          <div className="mcontrol-icon">
                            <span className="material-symbols-rounded">{icon}</span>
                          </div>
                          <div className="mcontrol-label">{valve.name}</div>
                          <div className="mcontrol-sublabel">{valve.idLabel}</div>
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
