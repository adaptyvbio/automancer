import { Chip, ChipTabComponentProps, Pool, React, util } from 'pr1';

import { type Runner, namespace, RunnerValveError } from '.';
import { Diagram } from './diagram';


export interface ManualControlState {
  targetChannelIndex: number | null;
}

export class ManualControl extends React.Component<ChipTabComponentProps, ManualControlState> {
  pool = new Pool();

  constructor(props: ChipTabComponentProps) {
    super(props);

    this.state = {
      targetChannelIndex: null
    };
  }

  get chip(): Chip {
    return this.props.host.state.chips[this.props.chipId];
  }

  render() {
    let runner = this.chip.runners[namespace] as Runner;
    let model = runner.settings.model;

    if (!model) {
      return <div />;
    }

    let signal = BigInt(runner.state.signal);

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
                    let status = runner.state.valves[channelIndex];

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
                                <div className="mcontrol-status-label">{RunnerValveError[status.error]}</div>
                              </div>
                            )}
                          </div>
                          <div className="mcontrol-switches">
                            <button type="button" className="mcontrol-switch" onClick={() => {
                              // this.props.host.backend.command(this.chip.id, {
                              //   control: {
                              //     type: 'signal',
                              //     signal: String((signal! & ~modelValveMask) | (modelValveMask * BigInt(active ? 0 : 1)))
                              //   }
                              // });
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
