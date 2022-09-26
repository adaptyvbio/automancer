import { setIn } from 'immutable';
import * as React from 'react';

import type { Route } from '../application';
import type { Draft, DraftCompilation } from '../draft';
import { Chip, ChipCondition, ChipId, ProtocolLocation } from '../backends/common';
import { Icon } from '../components/icon';
import { ProtocolOverview } from '../components/protocol-overview';
import { ProtocolTimeline } from '../components/protocol-timeline';
import { TextEditor } from '../components/text-editor';
import { Host } from '../host';
import { Codes } from '../units';
import * as util from '../util';
import { Pool } from '../util';


export interface Plan {
  context: {
    chipId: ChipId;
    data: Codes;
  } | null;
  location: ProtocolLocation;
}

export interface PlanData {
  chipId: ChipId;
  data: Codes;
}


export interface DraftOverviewProps {
  compilation: DraftCompilation | null;
  draft: Draft;
  host: Host;
  setRoute(route: Route): void;
}

export interface DraftOverviewState {
  plan: Plan;
  // planData: PlanData | null;
}

export class DraftOverview extends React.Component<DraftOverviewProps, DraftOverviewState> {
  pool = new Pool();

  constructor(props: DraftOverviewProps) {
    super(props);

    this.state = {
      plan: {
        context: null,
        location: {
          segmentIndex: 0,
          state: null
        }
      }
    };
  }

  render() {
    let chips = (
      Object.values(this.props.host.state.chips)
        .filter((chip) => chip.condition === ChipCondition.Ok)
    ) as Chip[];

    if (!this.props.compilation) {
      // The initial compilation is loading.
      return (
        <div className="blayout-contents" />
      );
    }

    let protocol = this.props.compilation.protocol;

    let plan = this.state.plan;
    let chip = plan.context && (this.props.host.state.chips[plan.context.chipId] as Chip);

    return (
      <div className="blayout-contents">
        {protocol
          ? (
            <>
              <div className="header header--2">
                <h2>Timeline</h2>
              </div>

              <ProtocolTimeline protocol={protocol} />

              <div className="header header--2">
                <h2>Sequence</h2>
              </div>

              <ProtocolOverview
                host={this.props.host}
                location={plan.location}
                protocol={protocol}
                setLocation={(location) => {
                  this.setState((state) => ({
                    plan: {
                      ...state.plan,
                      location
                    }
                  }));
                }} />

              <div className="header header--2">
                <h2>Start protocol</h2>
                <div className="superimposed-root">
                  <select className="superimposed-target" onInput={(event) => {
                    let chipId = event.currentTarget.value;
                    let _chip = this.props.host.state.chips[chipId] as Chip;

                    this.setState((state) => ({
                      plan: {
                        ...state.plan,
                        context: {
                          chipId,
                          data: Object.fromEntries(
                            Object.values(this.props.host.units)
                              .filter((unit) => unit.createCode)
                              .map((unit) => [unit.namespace, unit.createCode!(protocol!)])
                          ) as unknown as Codes
                        }
                      }
                    }));
                  }}>
                    {!chip && <option value="">–</option>}
                    {chips.map((chip) => (
                      <option
                        value={chip.id}
                        key={chip.id}
                        disabled={(chip.condition !== ChipCondition.Ok) || (chip.master !== null) || (Object.entries(this.props.host.units)
                          .filter(([namespace, _unit]) => chip.unitList.includes(namespace))
                          .some(([_namespace, unit]) => unit.canChipRunProtocol && !unit.canChipRunProtocol(protocol!, chip)))}>
                        {this.props.host.units.metadata.getChipMetadata(chip).title}
                      </option>
                    ))}
                  </select>
                  <div className="btn illustrated-root superimposed-visible">
                    <div>{chip ? `Chip: ${this.props.host.units.metadata.getChipMetadata(chip).title}` : 'Select experiment'}</div>
                    <div className="btn-icon"><Icon name="expand_more" /></div>
                  </div>
                </div>
              </div>

              {plan.context && (
                <>
                  <div className="pconfig-root">
                    {Object.entries(this.props.host.units)
                      .filter(([namespace, _unit]) => chip!.unitList.includes(namespace))
                      .map(([_namespace, unit]) => {
                        if (!unit.CodeEditor || !(unit.namespace in plan.context!.data)) {
                          return null;
                        }

                        return (
                          <unit.CodeEditor
                            chip={chip!}
                            draft={this.props.draft}
                            code={plan.context!.data[unit.namespace as keyof Codes]}
                            host={this.props.host}
                            setCode={(code: Codes[keyof Codes]) => {
                              this.setState((state) => ({
                                plan: setIn(state.plan, ['context', 'data', unit.namespace], code)
                              }));
                            }}
                            key={unit.namespace} />
                        );
                      })}
                  </div>
                  <div className="pconfig-submit">
                    <button type="button" className="btn" onClick={() => {
                      this.pool.add(async () => {
                        let source = await this.props.draft.item.source;

                        if (source !== null) {
                          await this.props.host.backend.startPlan({
                            chipId: plan.context!.chipId,
                            data: plan.context!.data,
                            location: plan.location,
                            source
                          });

                          this.props.setRoute(['chip', plan.context!.chipId, 'protocol']);
                        }
                      });
                    }}>
                      <Icon name="play_circle" />
                      <span>Start</span>
                    </button>
                  </div>
                </>
              )}
            </>
          )
          : (
            <div className="blayout-blank-outer">
              <div className="blayout-blank-inner">
                <p>Invalid source code</p>
                <button type="button" className="btn" onClick={() => {
                  // TODO: With the navigation API, add { info: { revealError: true } }
                  this.props.setRoute(['protocol', this.props.draft.id, 'text']);
                }}>Open code editor</button>
              </div>
            </div>
          )}
      </div>
    )
  }
}
