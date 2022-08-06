import * as React from 'react';

import type { Route } from '../application';
import type { Host } from '../host';
import { Chip, ChipId } from '../backends/common';
import { BarNav } from '../components/bar-nav';
import { ChipControl } from '../components/chip-control';
import { ChipProtocol } from '../components/chip-protocol';
import { ChipSettings } from '../components/chip-settings';
import { Pool } from '../util';
import * as util from '../util';


export interface ViewChipProps {
  chipId: ChipId;
  host: Host;
  tab: string;
  setRoute(route: Route): void;
}

export interface ViewChipState {

}

export class ViewChip extends React.Component<ViewChipProps, ViewChipState> {
  pool = new Pool();

  constructor(props: ViewChipProps) {
    super(props);

    this.state = {
      targetValveIndex: null
    };
  }

  get chip(): Chip {
    return this.props.host.state.chips[this.props.chipId];
  }

  componentDidUpdate() {
    if ((this.props.tab === 'protocol') && !this.chip.master) {
      this.props.setRoute(['chip', this.chip.id, 'settings']);
    }
  }

  shouldComponentUpdate(nextProps: ViewChipProps, nextState: ViewChipState) {
    return (nextState !== this.state)
      || (nextProps.host.state !== this.props.host.state)
      || (nextProps.chipId !== this.props.chipId)
      || (nextProps.tab !== this.props.tab);
  }

  render() {
    let unitNavEntries = Object.values(this.props.host.units)
      .flatMap((unit) => unit.getChipTabs?.(this.chip) ?? [])
      .map((entry) => ({
        ...entry,
        id: 'units.' + entry.id
      }));

    let component = (() => {
      switch (this.props.tab) {
        case 'control': return (
          <ChipControl
            chipId={this.props.chipId}
            host={this.props.host} />
        );
        case 'protocol': return (
          <ChipProtocol
            chipId={this.props.chipId}
            host={this.props.host} />
        );
        case 'settings': return (
          <ChipSettings
            chipId={this.props.chipId}
            host={this.props.host} />
        );
      }

      for (let entry of unitNavEntries) {
        if (entry.id === this.props.tab) {
          let Component = entry.component;
          return <Component
            chipId={this.chip.id}
            host={this.props.host}
            setRoute={this.props.setRoute} />
        }
      }
    })();

    return (
      <main className="blayout-container">
        <div className="blayout-header">
          <h1>{this.chip.name}</h1>
          <BarNav
            entries={[
              { id: 'protocol', label: 'Protocol', icon: 'receipt_long', disabled: !this.chip.master },
              { id: 'settings', label: 'Settings', icon: 'settings' },
              { id: 'history', label: 'History', icon: 'history', disabled: true },
              ...unitNavEntries
            ]}
            selectEntry={(tab) => {
              this.props.setRoute(['chip', this.props.chipId, tab]);
            }}
            selectedEntryId={this.props.tab} />
        </div>

        {component}
      </main>
    );
  }
}
