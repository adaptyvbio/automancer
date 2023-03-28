import { setIn } from 'immutable';
import * as React from 'react';

import { GraphEditor } from './graph-editor';
import type { Route } from '../application';
import type { Draft, DraftCompilation } from '../draft';
import { Icon } from '../components/icon';
import { ProtocolOverview } from '../components/protocol-overview';
import { ProtocolTimeline } from '../components/protocol-timeline';
import { TextEditor } from '../components/text-editor';
import { Host } from '../host';
import { Codes } from '../units';
import * as util from '../util';
import { Pool } from '../util';
import { Chip, ChipCondition, ChipId, ProtocolLocation } from 'pr1-shared';


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
    if (!this.props.compilation) {
      // The initial compilation is loading.
      return (
        <div className="blayout-contents" />
      );
    }

    let protocol = this.props.compilation.protocol;

    let plan = this.state.plan;
    let chip = plan.context && (this.props.host.state.chips[plan.context.chipId] as Chip);
    // if (protocol) console.log(protocol.root)

    return (
      <div className="blayout-contents">
        {protocol
          ? (
            <>
              <GraphEditor
                host={this.props.host}
                tree={protocol.root} />
              <div className="header header--2">
                <h2>Start protocol</h2>
                <div className="superimposed-root">
                  <select className="superimposed-target" onInput={(event) => {
                    let chipId = event.currentTarget.value as ChipId;
                    let _chip = this.props.host.state.chips[chipId] as Chip;

                    this.props.host.client.request({
                      type: 'startDraft',
                      chipId,
                      draftId: crypto.randomUUID(),
                      source: this.props.draft.item.source!,
                    });
                  }}>
                    {!chip && <option value="">–</option>}
                    {Object.values(this.props.host.state.chips)
                      .filter((chip) => chip.readable)
                        .map((chip) => {
                        let metadata = this.props.host.units.metadata.getChipMetadata(chip);

                        return (
                          <option
                            value={chip.id}
                            key={chip.id}
                            disabled={(chip.condition !== ChipCondition.Ok) || metadata.archived || (chip.master !== null) || (Object.entries(this.props.host.units)
                              .filter(([namespace, _unit]) => chip.unitList.includes(namespace))
                              .some(([_namespace, unit]) => unit.canChipRunProtocol && !unit.canChipRunProtocol(protocol!, chip)))}>
                            {metadata.title}
                          </option>
                        );
                      })}
                  </select>
                  <div className="btn illustrated-root superimposed-visible">
                    <div>{chip ? `Chip: ${this.props.host.units.metadata.getChipMetadata(chip).title}` : 'Select experiment'}</div>
                    <div className="btn-icon"><Icon name="expand_more" /></div>
                  </div>
                </div>
              </div>
            </>
          )
          : (
            <div className="blayout-blank-outer">
              <div className="blayout-blank-inner">
                <p>Invalid source code</p>
                <button type="button" className="btn" onClick={() => {
                  // TODO: With the navigation API, add { info: { revealError: true } }
                  // this.props.setRoute(['protocol', this.props.draft.id, 'text']);
                }}>Open code editor</button>
              </div>
            </div>
          )}
      </div>
    )
  }
}
