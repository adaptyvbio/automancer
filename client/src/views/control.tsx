import * as React from 'react';

import * as Rf from 'retroflex';
import { Model } from '..';
import { ControlNamespace } from '../backends/common';
import * as util from '../util';


interface ViewControlState {
  activeHostChipId: [string, string] | null;
}

export default class ViewControl extends React.Component<Rf.ViewProps<Model>, ViewControlState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {
      activeHostChipId: null
    };
  }

  render() {
    let host = Object.values(this.props.model.hosts)[0];

    if (!host) {
      return <div />;
    }

    let chip = Object.values(host.state.chips)[0];
    let model = host.state.models[chip.modelId];

    let modelControl = model.sheets.control;
    let runner = chip.runners.control;
    let signal = BigInt(runner.signal);

    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group">
            </div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          <div className="control-root">
            {modelControl.groups.map((group, groupIndex) => (
              <div className="control-group" style={{ '--group-color': group.color } as React.CSSProperties} key={groupIndex}>
                <h2>{group.name}</h2>
                <div className="control-list">
                  {Array.from(modelControl.valves.entries())
                    .filter(([_modelValveIndex, modelValve]) => modelValve.group === groupIndex)
                    .map(([modelValveIndex, modelValve]) => {
                      let modelValveMask = 1n << BigInt(modelValveIndex);
                      let active = (signal & modelValveMask) > 0;
                      let status = runner.valves[modelValveIndex];
                      let setValue = (value: number) => {
                        host.backend.command(chip.id, {
                          control: {
                            type: 'signal',
                            signal: String((signal & ~modelValveMask) | (modelValveMask * BigInt(value)))
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
          </div>


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
