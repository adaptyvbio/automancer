import * as React from 'react';

import type { Host } from '../host';
import { Chip, ChipId } from '../backends/common';
import { BarNav } from '../components/bar-nav';
import { ChipProtocol } from '../components/chip-protocol';
import { ChipSettings } from '../components/chip-settings';
import { ErrorBoundary } from '../components/error-boundary';
import { TitleBar } from '../components/title-bar';
import { Pool } from '../util';
import * as util from '../util';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { MetadataTools } from '../unit';
import { BaseUrl } from '../constants';
import { ViewExperiments } from './experiments';

import viewStyles from '../../styles/components/view.module.scss';


export type ViewChipRoute = {
  id: 'settings';
  params: { chipId: ChipId; };
} | {
  id: 'unit';
  params: { chipId: ChipId; };
};

export type ViewChipProps = ViewProps<ViewChipRoute>;

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

  get chip() {
    return this.props.host.state.chips[this.props.route.params.chipId] as Chip;
  }

  get routePrefix() {
    return `${BaseUrl}/chip/${this.chip.id}`;
  }

  componentDidMount() {
    if (!this.chip) {
      ViewExperiments.navigate();
    }
  }

  // TODO: Redirect when on the master tab and there is no master.

  // shouldComponentUpdate(nextProps: ViewChipProps, nextState: ViewChipState) {
  //   return (nextState !== this.state)
  //     || (nextProps.host.state !== this.props.host.state)
  //     || (nextProps.host.units !== this.props.host.units)
  //     || (nextProps.chipId !== this.props.chipId)
  //     || (nextProps.tab !== this.props.tab);
  // }

  render() {
    if (!this.chip) {
      return null;
    }

    let metadataTools = this.props.host.units.metadata as unknown as MetadataTools;
    let metadata = metadataTools.getChipMetadata(this.chip);

    let unitEntries = Object.values(this.props.host.units)
      .filter((unit) => this.chip.unitList.includes(unit.namespace))
      .flatMap((unit) => (unit.getChipTabs?.(this.chip) ?? []).map((entry) => ({
        ...entry,
        id: 'unit.' + entry.id,
        initialId: entry.id,
        href: `${this.routePrefix}/${entry.id}`,
        namespace: unit.namespace
      })));

    let component = (() => {
      switch (this.props.route.id) {
        case 'protocol': return (
          <ChipProtocol
            chipId={this.chip.id}
            host={this.props.host} />
        );
        case 'settings': return (
          <ChipSettings
            chipId={this.chip.id}
            host={this.props.host} />
        );
      }

      /* for (let entry of unitEntries) {
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
      } */
    })();

    return (
      <main className={viewStyles.root}>
        <TitleBar title={metadata.title} />
        <div className={util.formatClass(viewStyles.contents, viewStyles.legacy, 'blayout-container')}>
          <div className="blayout-header">
            <h1>{metadata.title}</h1>
            <BarNav
              entries={[
                { id: 'protocol', href: this.routePrefix + '/execution', label: 'Protocol', icon: 'receipt_long', disabled: !this.chip.master },
                { id: 'settings', href: this.routePrefix, label: 'Settings', icon: 'settings' },
                ...unitEntries
              ]}
              selectedEntryId={this.props.route.id} />
          </div>

          {component}
        </div>
      </main>
    );
  }


  static navigate(chipId: ChipId) {
    return navigation.navigate(`${BaseUrl}/chip/${chipId}`);
  }

  static routes = [
    { id: 'settings', pattern: '/chip/:chipId' }
    // { id: 'unit', pattern: '/chip/:chipId/:unitNamespace' }
  ];

  static hash(options: ViewHashOptions<ViewChipRoute>) {
    return options.route.params.chipId;
  }
}
