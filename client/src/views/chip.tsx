import * as React from 'react';

import type { Host, Route } from '../application';
import { Chip, ChipId, ChipModel, ControlNamespace } from '../backends/common';
import { Pool } from '../util';
import * as util from '../util';


export interface ViewChipProps {
  chipId: ChipId;
  host: Host;
  setRoute(route: Route): void;
}

export class ViewChip extends React.Component<ViewChipProps> {
  pool = new Pool();

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

    console.log(matrix, sheet, runner);

    return (
      <main>
        <h1>{this.chip.name}</h1>

        <div className="header2">
          <h2>Manual control</h2>
        </div>

        <div className="mcontrol-root">
          {sheet.groups.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
              <h3 className="mcontrol-grouptitle">{group.name}</h3>
              <div className="mcontrol-group">
                {Array.from(sheet.valves.entries())
                  .filter(([_valveIndex, valve]) => valve.group === groupIndex)
                  .map(([valveIndex, valve]) => {
                    let active = ((1n << BigInt(valveIndex)) & signal) > 0;
                    let modelValveMask = 1n << BigInt(valveIndex);
                    // let active = Math.random() > 0.5;
                    let status = runner.valves[valveIndex];

                    return (
                      <div className={util.formatClass('mcontrol-entry', { '_on': active })} key={valveIndex}>
                        <div className="mcontrol-icon">
                          <span className="material-symbols-rounded">air</span>
                        </div>
                        <div className="mcontrol-label">{valve.names[0]}</div>
                        <div className="mcontrol-sublabel">inlet/1</div>
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
                              <span className="material-symbols-rounded">air</span>
                            </div>
                            <div className="mcontrol-switch-label">{active ? 'On' : 'Off'}</div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* <div className="mcontrol-root">
          <div className="mcontrol-group">
            <div className="mcontrol-entry">
              <div className="mcontrol-icon">
                <span className="material-symbols-rounded">air</span>
              </div>
              <div className="mcontrol-label">Inlet 1</div>
              <div className="mcontrol-sublabel">inlet/1</div>
              <div className="mcontrol-statuses">
                <div className="mcontrol-status mcontrol-status--warning">
                  <div className="mcontrol-status-icon">
                    <span className="material-symbols-rounded">error</span>
                  </div>
                  <div className="mcontrol-status-label">Unbound</div>
                </div>
                <div className="mcontrol-status">
                  <div className="mcontrol-status-icon">
                    <span className="material-symbols-rounded">motion_photos_auto</span>
                  </div>
                  <div className="mcontrol-status-label">Automatic</div>
                </div>
              </div>
              <div className="mcontrol-switches">
                <button type="button" className="mcontrol-switch">
                  <div className="mcontrol-switch-icon">
                    <span className="material-symbols-rounded">air</span>
                  </div>
                  <div className="mcontrol-switch-label">Off</div>
                </button>
              </div>
            </div>
            <div className="mcontrol-entry">
              <div className="mcontrol-icon">
                <span className="material-symbols-rounded">air</span>
              </div>
              <div className="mcontrol-label">Inlet 1</div>
              <div className="mcontrol-sublabel">inlet/1</div>
              <div className="mcontrol-statuses" />
              <div className="mcontrol-switches">
                <button type="button" className="mcontrol-switch">
                  <div className="mcontrol-switch-label">Set auto</div>
                </button>
                <button type="button" className="mcontrol-switch">
                  <div className="mcontrol-switch-icon">
                    <span className="material-symbols-rounded">download</span>
                  </div>
                  <div className="mcontrol-switch-label">Off</div>
                </button>
              </div>
            </div>
            <div className="mcontrol-entry _on">
              <div className="mcontrol-icon">
                <span className="material-symbols-rounded">air</span>
              </div>
              <div className="mcontrol-label">Inlet 1</div>
              <div className="mcontrol-sublabel">inlet/1</div>
              <button type="button" className="mcontrol-switch">
                <div className="mcontrol-switch-icon">
                  <span className="material-symbols-rounded">download</span>
                </div>
                <div className="mcontrol-switch-label">On</div>
              </button>
            </div>
          </div>
        </div> */}
      </main>
    );
  }
}
