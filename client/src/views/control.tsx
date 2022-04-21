import * as React from 'react';

import * as Rf from 'retroflex';
import { Model } from '..';
import { ChipId, ControlNamespace, HostId } from '../backends/common';
import SelectChip from '../components/select-chip';
import * as util from '../util';


interface ViewControlState {
  selectedHostChipId: [HostId, ChipId] | null;
}

export default class ViewControl extends React.Component<Rf.ViewProps<Model>, ViewControlState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      selectedHostChipId: null
    };
  }

  render() {
    let host = this.state.selectedHostChipId && this.props.model.hosts[this.state.selectedHostChipId[0]];
    let chip = this.state.selectedHostChipId && host!.state.chips[this.state.selectedHostChipId[1]];
    let model = host && host.state.models[chip!.modelId];

    let modelControl = model?.sheets.control!;
    let runner = chip?.runners.control;
    let signal = runner && BigInt(runner.signal);

    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group">
              <SelectChip
                hosts={this.props.model.hosts}
                onSelect={(selectedHostChipId) => {
                  this.setState({ selectedHostChipId });
                }}
                selected={this.state.selectedHostChipId} />
            </div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          {modelControl && <div className="control-root">
            {modelControl.groups.map((group, groupIndex) => (
              <div className="control-group" style={{ '--group-color': group.color } as React.CSSProperties} key={groupIndex}>
                <h2>{group.name}</h2>
                <div className="control-list">
                  {Array.from(modelControl.valves.entries())
                    .filter(([_modelValveIndex, modelValve]) => modelValve.group === groupIndex)
                    .map(([modelValveIndex, modelValve]) => {
                      let modelValveMask = 1n << BigInt(modelValveIndex);
                      let active = (signal! & modelValveMask) > 0;
                      let status = runner!.valves[modelValveIndex];
                      let setValue = (value: number) => {
                        host!.backend.command(chip!.id, {
                          control: {
                            type: 'signal',
                            signal: String((signal! & ~modelValveMask) | (modelValveMask * BigInt(value)))
                          }
                        });
                      };

                      return (
                        <React.Fragment key={modelValveIndex}>
                          <div className="control-name">{modelValve.names[0]}</div>
                          <div className="control-toggle">
                            <button type="button" className={util.formatClass({ '_active': !active })} onClick={() => void setValue(0)}>Off</button>
                            <button type="button" className={util.formatClass({ '_active': active })} onClick={() => void setValue(1)}>On</button>
                            <button type="button">Auto</button>
                          </div>
                          {(status.error !== null) && (
                            <div className="control-error" title={ControlNamespace.RunnerValveError[status.error]}><Rf.Icon name="error" /></div>
                          )}
                        </React.Fragment>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>}


          {/* <div className="control-root" style={{ '--color': 'red' } as React.CSSProperties}>
            <h2><span>Multiplexer</span></h2>
            <div className="control-list">
              <div className="control-name">mult1</div>
              <div className="control-toggle">
                {['On', 'Off', 'Auto'].map((name, index) =>
                  <button type="button" className={this.state.activeValue === index ? '_selected' : ''} key={name} onClick={() => void this.setState({ activeValue: index })}>{name}</button>
                )}
              </div>
              <div className="control-error"><Rf.Icon name="error" /></div>

              <div className="control-name">mult1</div>
              <div className="control-toggle">
                {['On', 'Off', 'Auto'].map((name, index) =>
                  <button type="button" className={this.state.activeValue === index ? '_selected' : ''} key={name} onClick={() => void this.setState({ activeValue: index })}>{name}</button>
                )}
              </div>
              <div className="control-name">mult1</div>
              <div className="control-toggle">
                {['On', 'Off', 'Auto'].map((name, index) =>
                  <button type="button" className={this.state.activeValue === index ? '_selected' : ''} key={name} onClick={() => void this.setState({ activeValue: index })}>{name}</button>
                )}
              </div>
              <div className="control-name">mult1</div>
              <div className="control-toggle">
                {['On', 'Off', 'Auto'].map((name, index) =>
                  <button type="button" className={this.state.activeValue === index ? '_selected' : ''} key={name} onClick={() => void this.setState({ activeValue: index })}>{name}</button>
                )}
              </div>
            </div>
          </div> */}
        </Rf.ViewBody>
      </>
    )
  }
}
