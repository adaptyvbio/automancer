import { Set as ImSet, List } from 'immutable';
import * as React from 'react';

import { Host, Route } from '../application';
import { HostId } from '../backends/common';
import { Draft, DraftId } from '../draft';
import * as util from '../util';


export interface SidebarProps {
  currentRoute: Route | null;
  setRoute(route: Route): void;

  hosts: Record<HostId, Host>;
  selectedHostId: HostId | null;
  onSelectHost(id: HostId | null): void;

  drafts: Record<DraftId, Draft>;
  openDraftIds: ImSet<DraftId>;
}

export class Sidebar extends React.Component<SidebarProps> {
  render() {
    let host: Host | undefined = this.props.hosts[this.props.selectedHostId!];
    let hosts = Object.values(this.props.hosts);

    let currentRoute = this.props.currentRoute;
    let currentRouteList = currentRoute && List(currentRoute);

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
      }[];
    }[] = host
      ? [
        { id: 'main',
        entries: [
          { id: 'dashboard',
            label: 'Dashboard',
            icon: 'dashboard',
            route: ['dashboard'] },
          { id: 'chip',
            label: 'Chips',
            icon: 'memory',
            route: ['chip'],
            children: Object.values(host.state.chips).map((chip) => ({
              id: chip.id,
              label: chip.name,
              route: ['chip', chip.id, 'settings'],
              routeRef: ['chip', chip.id]
            })) },
          { id: 'protocol',
            label: 'Protocols',
            icon: 'receipt_long',
            route: ['protocol'],
            children: this.props.openDraftIds.toArray()
              .map((draftId) => this.props.drafts[draftId])
              .map((draft) => ({
                id: draft.id,
                label: draft.entry.name ?? '[Untitled]',
                route: ['protocol', draft.id]
              })) },
          { id: 'terminal',
            label: 'Terminal',
            icon: 'terminal',
            route: ['terminal'] }
        ] },
        { id: 'last',
        entries: [
          { id: 'settings',
            label: 'Settings',
            icon: 'settings',
            route: null }
        ] }
      ]
      : [];

    return (
      <aside className="sidebar-root">
        <div className="sidebar-header">
          <div className="sidebar-host-logo">
            <span className="material-symbols-rounded">developer_board</span>
          </div>
          <div className="sidebar-host-select">
            {(hosts.length > 0) && (
              <select className="sidebar-host-input" value={this.props.selectedHostId ?? ''} onChange={(event) => {
                this.props.onSelectHost(event.currentTarget.value || null);
              }}>
                {!host && <option value="">–</option>}
                {hosts.map((host) => (
                  <option key={host.id} value={host.id}>{host.state.info.name}</option>
                ))}
              </select>
            )}
            <div className="sidebar-host-selected">
              <div className="sidebar-host-subtitle">Host</div>
              <div className="sidebar-host-title">{host?.state.info.name ?? '–'}</div>
              {(hosts.length > 0) && (
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
                    onClick={(entry.route ?? undefined) && (() => {
                      this.props.setRoute(entry.route!);
                    })}>
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
