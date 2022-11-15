import { setIn } from 'immutable';
import * as React from 'react';

import { GraphEditor } from './graph-editor';
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
import { getChipMetadata } from '../backends/misc';


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
    // if (protocol) console.log(protocol.root)

    return (
      <div className="blayout-contents">
        {protocol
          ? (
            <>
              <GraphEditor
                host={this.props.host}
                tree={protocol.root} />
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
