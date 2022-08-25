import * as React from 'react';

import type { Route } from '../application';
import type { Host } from '../host';
import { Chip, ChipId } from '../backends/common';
import { BarNav } from '../components/bar-nav';
import { ChipProtocol } from '../components/chip-protocol';
import { ChipSettings } from '../components/chip-settings';
import { ErrorBoundary } from '../components/error-boundary';
import { Pool } from '../util';
import * as util from '../util';
import { getChipMetadata } from '../backends/misc';


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
    return this.props.host.state.chips[this.props.chipId] as Chip;
  }

  componentDidUpdate() {
    if ((this.props.tab === 'protocol') && !this.chip.master) {
      this.props.setRoute(['chip', this.chip.id, 'settings']);
    }
  }

  shouldComponentUpdate(nextProps: ViewChipProps, nextState: ViewChipState) {
    return (nextState !== this.state)
      || (nextProps.host.state !== this.props.host.state)
      || (nextProps.host.units !== this.props.host.units)
      || (nextProps.chipId !== this.props.chipId)
      || (nextProps.tab !== this.props.tab);
  }

  render() {
    let metadata = getChipMetadata(this.chip);

    let unitEntries = Object.values(this.props.host.units)
      .flatMap((unit) => (unit.getChipTabs?.(this.chip) ?? []).map((entry) => ({
        ...entry,
        id: 'unit.' + entry.id,
        initialId: entry.id,
        namespace: unit.namespace
      })));

    let component = (() => {
      switch (this.props.tab) {
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

      for (let entry of unitEntries) {
        if (entry.id === this.props.tab) {
          let Component = entry.component;

          return (
            <ErrorBoundary
              getErrorMessage={() => <>Failed to render the <strong>{entry.initialId}</strong> tab of unit <strong>{entry.namespace}</strong>.</>}
              wide={true}>
              <Component
                chipId={this.chip.id}
                host={this.props.host}
                setRoute={this.props.setRoute} />
            </ErrorBoundary>
          );
        }
      }
    })();

    return (
      <main className="blayout-container">
        <div className="blayout-header">
          <h1>{metadata.title}</h1>
          <BarNav
            entries={[
              { id: 'protocol', label: 'Protocol', icon: 'receipt_long', disabled: !this.chip.master },
              { id: 'settings', label: 'Settings', icon: 'settings' },
              { id: 'history', label: 'History', icon: 'history', disabled: true },
              ...unitEntries
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
