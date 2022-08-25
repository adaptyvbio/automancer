import { Chip, ChipTabComponentProps, Pool, React, util } from 'pr1';

import { type Runner, namespace, RunnerValveError, Command, ReprData } from '.';
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
    return this.props.host.state.chips[this.props.chipId] as Chip;
  }

  render() {
    let runner = this.chip.runners[namespace] as Runner;
    let model = runner.settings.model;

    if (!model) {
      return <div />;
    }

    let signal = BigInt(runner.state.signal);

    return (
      <div className="mcontrol-root">
        {/* <MockGroup name="Inlet" n={8} />
        <MockGroup name="Multiplexer" n={8} />
        <MockGroup name="Special" n={4} /> */}

        {model.diagram && (
          <Diagram
            model={model}
            signal={signal}
            targetChannelIndex={this.state.targetChannelIndex} />
        )}

        {model.groups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            <div className="mcontrol-group">
              <h3 className="mcontrol-group-title">{group.label}</h3>
              <div className="mcontrol-group-entries">
                {group.channelIndices.map((channelIndex) => {
                  let channel = model!.channels[channelIndex];
                  let active = ((1n << BigInt(channelIndex)) & signal) > 0;
                  let channelMask = 1n << BigInt(channelIndex);
                  let status = runner.state.valves[channelIndex];

                  let icon = ReprData.icons[channel.repr].forwards;

                  return (
                    <ManualControlEntry
                      active={active}
                      icon={icon}
                      label={channel.label ?? `Channel ${channelIndex}`}
                      sublabel={channel.id}
                      onMouseEnter={() => {
                        this.setState({ targetChannelIndex: channelIndex });
                      }}
                      onMouseLeave={() => {
                        this.setState({ targetChannelIndex: null });
                      }}
                      onSwitch={() => {
                        this.pool.add(async () => {
                          await this.props.host.backend.command<Command>({
                            chipId: this.chip.id,
                            namespace,
                            command: {
                              type: 'setSignal',
                              signal: String((signal! & ~channelMask) | (channelMask * BigInt(active ? 0 : 1)))
                            }
                          });
                        });
                      }}
                      statuses={status.error !== null ? [{ label: RunnerValveError[status.error] }] : []}
                      key={channel.id} />
                  );
                })}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }
}


function ManualControlEntry(props: {
  active: boolean;
  icon: string;
  label: string;
  onMouseEnter?(): void;
  onMouseLeave?(): void;
  onSwitch(): void;
  statuses: {
    label: string;
  }[];
  sublabel: string;
}) {
  return (
    <div
      className={util.formatClass('mcontrol-entry', { '_on': props.active })}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}>
      <div className="mcontrol-icon">
        <span className="material-symbols-rounded">{props.icon}</span>
      </div>
      <div className="mcontrol-label">{props.label}</div>
      <div className="mcontrol-sublabel">{props.sublabel}</div>
      <div className="mcontrol-statuses">
        {props.statuses.map((status, statusIndex) => (
          <div className="mcontrol-status mcontrol-status--warning" key={statusIndex}>
            <div className="mcontrol-status-icon">
              <span className="material-symbols-rounded">error</span>
            </div>
            <div className="mcontrol-status-label">{status.label}</div>
          </div>
        ))}
      </div>
      <div className="mcontrol-switches">
        <button type="button" className="mcontrol-switch" onClick={props.onSwitch}>
          <div className="mcontrol-switch-icon">
            <span className="material-symbols-rounded">{props.icon}</span>
          </div>
          <div className="mcontrol-switch-label">{props.active ? 'On' : 'Off'}</div>
        </button>
      </div>
    </div>
  );
}


function MockGroup(props: { name: string; n: number; }) {
  return (
    <div className="mcontrol-group">
      <h3 className="mcontrol-group-title">{props.name}</h3>
      <div className="mcontrol-group-entries">
        {new Array(props.n).fill(0).map((_, index) => (
          <ManualControlEntry
            active={false}
            icon="air"
            label={`${props.name} ${index + 1}`}
            onSwitch={() => {}}
            sublabel={`${props.name.toLowerCase()}/${index + 1}`}
            statuses={[]}
            key={index} />
        ))}
      </div>
    </div>
  );
}
