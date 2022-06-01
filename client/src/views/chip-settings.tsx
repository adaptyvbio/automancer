import { setIn } from 'immutable';
import * as React from 'react';

import type { Host, Route } from '../application';
// import { Chip, HostState } from '../backends/common';
import { Chip, ChipId, ChipModel, ControlNamespace, HostId } from '../backends/common';
import { Pool } from '../util';
import * as util from '../util';


export interface ViewChipSettingsProps {
  chipId: ChipId;
  host: Host;
  setRoute(route: Route): void;
}

export interface ViewChipSettingsState {
  name: string;
}

export class ViewChipSettings extends React.Component<ViewChipSettingsProps, ViewChipSettingsState> {
  pool = new Pool();

  constructor(props: ViewChipSettingsProps) {
    super(props);

    this.state = {
      name: this.chip.name
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


    return (
      <main>
        <h1>Chip settings</h1>

        <div className="form-container">
          <div className="header2">
            <h2>General</h2>
          </div>

          <p>Vivamus porttitor placerat est, id rhoncus libero luctus id. Donec tortor nunc, pretium sit amet consequat eget, eleifend in elit. Mauris porttitor luctus malesuada. Nunc porttitor turpis ac nisi laoreet bibendum. Nullam tempus purus eu viverra dignissim.</p>
          <label className="form-control">
            <div>Chip name</div>
            <input type="text" placeholder="e.g. Alpha" value={this.state.name}
              onInput={(event) => {
                this.setState({ name: event.currentTarget.value });
              }}
              onBlur={(event) => {

              }} />
          </label>
          <label className="form-control">
            <div>Details</div>
            <textarea placeholder="e.g. Alpha"
              onInput={(event) => {
                this.setState({ name: event.currentTarget.value });
              }}
              onBlur={(event) => {

              }}>{this.state.name}</textarea>
          </label>

          <div className="header2">
            <h2>Control</h2>
          </div>

          <div className="mcontrol-root">
            {sheet.groups.map((group, groupIndex) => (
              <React.Fragment key={groupIndex}>
                <h3 className="mcontrol-grouptitle">{group.name}</h3>
                <div className="mcontrol-group">
                  {Array.from(sheet.valves.entries())
                    .filter(([_valveIndex, valve]) => valve.group === groupIndex)
                    .map(([valveIndex, valve]) => {
                      let active = true;
                      let modelValveMask = 1n << BigInt(valveIndex);
                      // let active = Math.random() > 0.5;
                      let status = { error: 0 };

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
        </div>
      </main>
    );

    // if (this.chip) {
    //   console.log(this.chip, this.chipModel);
    // }

    // return (
    //   <>
    //     <Rf.ViewHeader>
    //       <div className="toolbar-root">
    //         <div className="toolbar-group">
    //           <SelectChip
    //             hosts={this.props.model.hosts}
    //             onSelect={(selectedHostChipId) => {
    //               this.setState({ selectedHostChipId });
    //             }}
    //             selected={this.state.selectedHostChipId} />
    //         </div>
    //       </div>
    //     </Rf.ViewHeader>
    //     <Rf.ViewBody>
    //       {chip && (
    //         <div className="pr-section-list">
    //           <Rf.PropertiesSection name="Chip">
    //             <Rf.PropertiesSection name="General">
    //               <div className="pr-form-root">
    //                 <Rf.PropertiesEntry name="Name">
    //                   <Rf.Input.Text
    //                     // onChange={(name) => void this.setState({ name })}
    //                     value={chip.name} />
    //                 </Rf.PropertiesEntry>
    //               </div>
    //             </Rf.PropertiesSection>
    //             <Rf.PropertiesSection name="Valves">
    //               <div className="pr-form-root">
    //                 {this.chipModel!.sheets.control.valves.map((modelValve, modelValveIndex) => {
    //                   let chipValve = chip.matrices.control.valves[modelValveIndex];

    //                   return (
    //                     <Rf.PropertiesEntry name={modelValve.names[0]} key={modelValveIndex}>
    //                       <Rf.MenuSelect
    //                         menu={
    //                           Object.entries(host.state.executors.control.valves).map(([hostValveName, hostValveIndex]) => {
    //                             return {
    //                               id: String(hostValveIndex),
    //                               name: hostValveName
    //                             }
    //                           })
    //                         }
    //                         selectedOptionPath={chipValve.hostValveIndex !== null ? [String(chipValve.hostValveIndex)] : null}
    //                         onSelect={(selection) => {
    //                           let hostValveIndex = Number(selection.get(0));
    //                           let matrix = chip.matrices.control;
    //                           let otherModelValveIndex = matrix.valves.findIndex((chipValve) => chipValve.hostValveIndex === hostValveIndex);

    //                           let valves = setIn(matrix.valves, [modelValveIndex], {
    //                             ...matrix.valves[modelValveIndex],
    //                             hostValveIndex
    //                           });

    //                           if (otherModelValveIndex >= 0) {
    //                             valves = setIn(valves, [otherModelValveIndex], {
    //                               ...matrix.valves[otherModelValveIndex],
    //                               hostValveIndex: matrix.valves[modelValveIndex].hostValveIndex
    //                             });
    //                           }

    //                           // TODO: handle promise
    //                           host.backend.setMatrix(chip.id, {
    //                             control: {
    //                               ...chip.matrices.control,
    //                               valves
    //                             }
    //                           });
    //                         }} />
    //                     </Rf.PropertiesEntry>
    //                   );
    //                 })}
    //               </div>
    //             </Rf.PropertiesSection>
    //           </Rf.PropertiesSection>
    //         </div>
    //       )}
    //     </Rf.ViewBody>
    //   </>
    // );
  }
}
