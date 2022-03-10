import { setIn } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
// import { Chip, HostState } from '../backends/common';
import type { Chip, ChipId, ChipModel, HostId } from '../backends/common';


interface ViewChipSettingsState {
  selectedHostChipId: [HostId, ChipId] | null;

  // chipId: ChipId;
  // hostId: HostId;

  // pairIds: { chipId: ChipId; hostId: HostId; };
}

export default class ViewChipSettings extends React.Component<Rf.ViewProps<Model>, ViewChipSettingsState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      selectedHostChipId: null
    };
  }

  componentDidUpdate() {
    if (!this.state.selectedHostChipId) {
      let host = Object.values(this.props.model.hosts)[0].state;
      console.log('Debug: selected', [
        host.id,
        Object.values(host.chips)[0].id
      ]);

      this.setState({
        selectedHostChipId: [
          host.id,
          Object.values(host.chips)[0].id
        ]
      });
    }
  }

  get host(): Host | null {
    return this.state.selectedHostChipId
      ? this.props.model.hosts[this.state.selectedHostChipId[0]]
      : null;
  }

  get chip(): Chip | null {
    return this.host && this.host.state.chips[this.state.selectedHostChipId![1]];
  }

  get chipModel(): ChipModel | null {
    return this.host && this.host.state.chipModels[this.chip!.modelId];
  }

  render() {
    let chip = this.chip!;
    let host = this.host!;

    // if (this.chip) {
    //   console.log(this.chip, this.chipModel);
    // }

    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group">
              <Rf.Select
                selectedOptionPath={this.state.selectedHostChipId}
                menu={
                  Object.entries(this.props.model.hosts).map(([id, host]) => ({
                    id,
                    name: host.state.name,
                    children: Object.values(host.state.chips).map((chip, index) => ({
                      id: chip.id,
                      icon: 'memory',
                      name: chip.name
                    }))
                  }))
                }
                onSelect={([hostId, chipId]) => {
                  this.setState({ selectedHostChipId: [hostId, chipId] });
                }} />
            </div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          {chip && (
            <div className="pr-section-list">
              <Rf.PropertiesSection name="Chip">
                <Rf.PropertiesSection name="General">
                  <div className="pr-form-root">
                    <Rf.PropertiesEntry name="Name">
                      <Rf.Input.Text
                        // onChange={(name) => void this.setState({ name })}
                        value={chip.name} />
                    </Rf.PropertiesEntry>
                  </div>
                </Rf.PropertiesSection>
                <Rf.PropertiesSection name="Valves">
                  <div className="pr-form-root">
                    {this.chipModel!.sheets.control.valves.map((modelValve, modelValveIndex) => {
                      let chipValve = chip.matrices.control.valves[modelValveIndex];

                      return (
                        <Rf.PropertiesEntry name={modelValve.names[0]} key={modelValveIndex}>
                          <Rf.MenuSelect
                            menu={
                              Object.entries(host.state.executors.control.valves).map(([hostValveName, hostValveIndex]) => {
                                return {
                                  id: String(hostValveIndex),
                                  name: hostValveName
                                }
                              })
                            }
                            selectedOptionPath={chipValve.hostValveIndex !== null ? [String(chipValve.hostValveIndex)] : null}
                            onSelect={(selection) => {
                              let hostValveIndex = Number(selection.get(0));
                              let matrix = chip.matrices.control;
                              let otherModelValveIndex = matrix.valves.findIndex((chipValve) => chipValve.hostValveIndex === hostValveIndex);

                              let valves = setIn(matrix.valves, [modelValveIndex], {
                                ...matrix.valves[modelValveIndex],
                                hostValveIndex
                              });

                              if (otherModelValveIndex >= 0) {
                                valves = setIn(valves, [otherModelValveIndex], {
                                  ...matrix.valves[otherModelValveIndex],
                                  hostValveIndex: matrix.valves[modelValveIndex].hostValveIndex
                                });
                              }

                              // TODO: handle promise
                              host.backend.setMatrix(chip.id, {
                                control: {
                                  ...chip.matrices.control,
                                  valves
                                }
                              });
                            }} />
                        </Rf.PropertiesEntry>
                      );
                    })}
                  </div>
                </Rf.PropertiesSection>
              </Rf.PropertiesSection>
            </div>
          )}
        </Rf.ViewBody>
      </>
    );
  }
}
