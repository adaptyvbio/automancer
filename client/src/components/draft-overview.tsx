import { setIn } from 'immutable';
import * as React from 'react';

import type { Draft, Host, Route } from '../application';
import { ChipId } from '../backends/common';
import { Icon } from '../components/icon';
import { ProtocolOverview } from '../components/protocol-overview';
import { ProtocolTimeline } from '../components/protocol-timeline';
import { TextEditor } from '../components/text-editor';
// import Units, { UnitsCode } from '../units';
import * as util from '../util';
import { Pool } from '../util';


export interface PlanData {
  chipId: ChipId;
  // data: UnitsCode;
}


export interface DraftOverviewProps {
  draft: Draft;
  host: Host;
}

export interface DraftOverviewState {
  planData: PlanData | null;
}

export class DraftOverview extends React.Component<DraftOverviewProps, DraftOverviewState> {
  pool = new Pool();

  constructor(props: DraftOverviewProps) {
    super(props);

    this.state = {
      planData: null && {
        "chipId": Object.keys(this.props.host.state.chips)[0], // "d5547726-c709-4c08-8861-9d4fb5604f4f",
        "data": {
          "control": {
            "arguments": [
              null,
              null,
              null
            ]
          }
        }
      }
    };
  }

  render() {
    let chips = Object.values(this.props.host.state.chips);
    let protocol = this.props.draft.compiled?.protocol;

    let chip = this.state.planData && this.props.host.state.chips[this.state.planData.chipId];
    let model = chip && this.props.host.state.models[chip.modelId];

    return (
      <div>
        {protocol
          ? (
            <>
              <div className="header header--2">
                <h2>Timeline</h2>
              </div>

              <ProtocolTimeline protocol={protocol} />

              <div className="headerh header--2">
                <h2>Sequence</h2>
              </div>

              <ProtocolOverview protocol={protocol} />

              {/* <div className="header2">
                <h2>Start protocol</h2>
                <div className="superimposed-root">
                  <select className="superimposed-target" onInput={(event) => {
                    this.setState({
                      planData: {
                        chipId: event.currentTarget.value,
                        data: Object.fromEntries(
                          Units
                            .filter(([_namespace, Unit]) => Unit.createCode)
                            .map(([namespace, Unit]) => [namespace, Unit.createCode!(protocol!, model!)])
                        ) as unknown as UnitsCode
                      }
                    });
                  }}>
                    {!chip && <option value="">–</option>}
                    {chips.map((chip) => (
                      <option
                        value={chip.id}
                        key={chip.id}
                        disabled={((protocol?.modelIds ?? undefined) && !protocol!.modelIds?.includes(chip.modelId)) || (chip.master !== null)}>
                        {chip.name}
                      </option>
                    ))}
                  </select>
                  <div className="btn illustrated-root superimposed-visible">
                    <div>{chip ? `Chip: ${chip.name}` : 'Select chip'}</div>
                    <div className="btn-icon"><Icon name="expand_more" /></div>
                  </div>
                </div>
              </div>

              {this.state.planData && (
                <>
                  <div className="pconfig-root">
                    {Units.map(([rawNamespace, unit]) => {
                      if (!unit.CodeEditor || !(rawNamespace in this.state.planData!.data)) {
                        return null;
                      }

                      let namespace = rawNamespace as (keyof UnitsCode);

                      return (
                        <unit.CodeEditor
                          chip={chip!}
                          draft={this.props.draft}
                          model={model!}
                          code={this.state.planData!.data[namespace]}
                          setCode={(code: UnitsCode[typeof namespace]) => {
                            this.setState({
                              planData: setIn(this.state.planData, ['data', namespace], code)
                            });
                          }}
                          key={namespace} />
                      );
                    })}
                  </div>
                  <div className="pconfig-submit">
                    <button type="button" className="btn" onClick={() => {
                      this.pool.add(async () => {
                        this.props.host.backend.startPlan({
                          chipId: this.state.planData!.chipId,
                          data: this.state.planData!.data,
                          source: this.props.draft.source
                        });
                      });
                    }}>
                      <Icon name="play_circle" />
                      <span>Start</span>
                    </button>
                  </div>
                </>
              )} */}
            </>
          )
          : (
            <div className="blank">
              <p>Invalid protocol</p>
            </div>
          )}
      </div>
    )
  }
}
