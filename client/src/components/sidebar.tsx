import { Set as ImSet, List } from 'immutable';
import * as React from 'react';

import type { Host, HostSettingsRecord } from '../host';
import type { Route } from '../application';
import { ChipCondition, Chip, HostId } from '../backends/common';
import type { Draft, DraftId } from '../draft';
import * as util from '../util';


export interface SidebarProps {
  currentRoute: Route | null;
  setRoute(route: Route): void;
  setStartup?(): void;

  host: Host | null;
  hostSettingsRecord: HostSettingsRecord;
  selectedHostSettingsId: string | null;
  onSelectHost(id: HostId | null): void;

  drafts: Record<DraftId, Draft>;
  openDraftIds: ImSet<DraftId>;
}

export class Sidebar extends React.Component<SidebarProps> {
  render() {
    let hostSettings = this.props.hostSettingsRecord[this.props.selectedHostSettingsId!];
    let hostSettingsRecord = Object.values(this.props.hostSettingsRecord);

    let currentRoute = this.props.currentRoute;
    let currentRouteList = currentRoute && List(currentRoute);

    let unitEntries = this.props.host?.units && Object.values(this.props.host.units)
      .flatMap((unit) => (unit.getGeneralTabs?.() ?? []).map((entry) => ({
        ...entry,
        id: 'unit.' + entry.id,
        route: ['unit', unit.namespace, entry.id]
      })));

    let groups: {
      id: string;
      entries: {
        id: string;
        label: string;
        icon: string;
        route: Route | null;
        children?: {
          id: string;
          label: string;
          route: Route | null;
          routeRef?: Route;
        }[] | null;
        onClick?: () => void;
      }[];
    }[] = this.props.host
      ? [
        { id: 'main',
        entries: [
          { id: 'chip',
            label: 'Experiments',
            icon: 'science',
            route: ['chip'],
            children: [] /* (
              Object.values(this.props.host.state.chips)
                .filter((chip) => (chip.condition === ChipCondition.Ok)) as Chip[]
            ).map((chip) => ({
              id: chip.id,
              label: getChipMetadata(chip).title,
              route: ['chip', chip.id, 'settings'],
              routeRef: ['chip', chip.id]
            })) */
          },
          { id: 'protocol',
            label: 'Protocols',
            icon: 'receipt_long',
            route: ['protocol'],
            children: this.props.openDraftIds.toArray()
              .map((draftId) => this.props.drafts[draftId])
              .map((draft) => ({
                id: draft.id,
                label: draft.name ?? '[Untitled]',
                route: ['protocol', draft.id, 'overview'],
                routeRef: ['protocol', draft.id]
              })) }
        ] },
        ...(unitEntries && (unitEntries?.length > 0)
          ? [{ id: 'unit', entries: unitEntries }]
          : []),
        { id: 'last',
          entries: [
            { id: 'settings',
              label: 'Modules',
              icon: 'extension',
              route: ['settings'] },
            ...(this.props.setStartup
                ? [{
                  id: 'startup',
                  label: 'Start menu',
                  icon: 'home',
                  route: null,
                  onClick: () => void this.props.setStartup?.()
                }]
                : [])
          ] },
      ]
      : [];

    return (
      <aside className="sidebar-root">
        <div className="sidebar-header">
          <div className="sidebar-host-logo">
            <span className="material-symbols-rounded">developer_board</span>
          </div>
          <div className="sidebar-host-select">
            {(hostSettingsRecord.length > 0) && (
              <select className="sidebar-host-input" value={this.props.selectedHostSettingsId ?? ''} onChange={(event) => {
                this.props.onSelectHost(event.currentTarget.value || null);
              }}>
                {!this.props.host && <option value="">–</option>}
                {hostSettingsRecord.map((hostSettings) => (
                  <option key={hostSettings.id} value={hostSettings.id}>{hostSettings.label ?? hostSettings.id}</option>
                ))}
              </select>
            )}
            <div className="sidebar-host-selected">
              <div className="sidebar-host-subtitle">Host</div>
              <div className="sidebar-host-title">{this.props.host?.state.info.name ?? '–'}</div>
              {(hostSettingsRecord.length > 0) && (
                <div className="sidebar-host-expand">
                  <span className="material-symbols-rounded">unfold_more</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {groups.map((group) => (
            <div className="sidebar-group" key={group.id}>
              {group.entries.map((entry) => {
                let item = (
                  <button
                    type="button"
                    className={util.formatClass('sidebar-item', {
                      '_selected': entry.route && currentRouteList?.equals(List(entry.route)),
                      '_subselected': entry.route && currentRoute && isSuperset(currentRoute, entry.route)
                    })}
                    key={entry.id}
                    onClick={entry.onClick || ((entry.route ?? undefined) && (() => {
                      this.props.setRoute(entry.route!);
                    }))}>
                    <div className="sidebar-item-icon">
                      <span className="material-symbols-rounded">{entry.icon}</span>
                    </div>
                    <div className="sidebar-item-label">{entry.label}</div>
                  </button>
                );

                return ((entry.children?.length ?? 0) > 0)
                  ? (
                    <div className="sidebar-grouping" key={entry.id}>
                      {item}
                      <div className="sidebar-children">
                        {entry.children?.map((child) => {
                          let routeRef = child.routeRef ?? child.route;

                          return (
                            <button type="button"
                              className={util.formatClass('sidebar-child', { '_selected': routeRef && currentRoute && isSuperset(currentRoute, routeRef) })}
                              key={child.id}
                              onClick={(child.route ?? undefined) && (() => {
                                this.props.setRoute(child.route!);
                              })}>
                                {child.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                  : item;
              })}
            </div>
          ))}
        </nav>
      </aside>
    );
  }
}


// Is 'a' a superset of 'b'
function isSuperset<T>(a: T[], b: T[]): boolean {
  if (a.length < b.length) {
    return false;
  }

  for (let index = 0; index < b.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}
