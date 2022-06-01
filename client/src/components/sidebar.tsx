import { Set as ImSet, List } from 'immutable';
import * as React from 'react';

import { Draft, DraftId, Host, Route } from '../application';
import { HostId } from '../backends/common';
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

    let currentRoute = this.props.currentRoute && List(this.props.currentRoute);

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
              route: ['chip', chip.id]
            })) },
          { id: 'protocol',
            label: 'Protocols',
            icon: 'receipt_long',
            route: ['protocol'],
            children: this.props.openDraftIds.toArray()
              .map((draftId) => this.props.drafts[draftId])
              .map((draft) => ({
                id: draft.id,
                label: draft.name,
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
                      '_selected': entry.route && currentRoute?.equals(List(entry.route)),
                      '_subselected': entry.route && currentRoute?.isSuperset(List(entry.route))
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
                        {entry.children?.map((child) => (
                          <button type="button"
                            className={util.formatClass('sidebar-child', { '_selected': child.route && currentRoute?.equals(List(child.route)) })}
                            key={child.id}
                            onClick={(child.route ?? undefined) && (() => {
                              this.props.setRoute(child.route!);
                            })}>
                              {child.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                  : item;
              })}
            </div>
          ))}
          {/* <div className="sidebar-group">
            <button type="button" className="sidebar-item _selected">
              <div className="sidebar-item-icon">
                <span className="material-symbols-rounded">dashboard</span>
              </div>
              <div className="sidebar-item-label">Dashboard</div>
            </button>

            <div className="sidebar-grouping">
              <button type="button" className="sidebar-item">
                <div className="sidebar-item-icon">
                  <span className="material-symbols-rounded">memory</span>
                </div>
                <div className="sidebar-item-label">Chips</div>
              </button>
              <div className="sidebar-children">
                <button type="button" className="sidebar-child">Chip Alpha</button>
                <button type="button" className="sidebar-child">Chip Bravo</button>
              </div>
            </div>

            <button type="button" className="sidebar-item">
              <div className="sidebar-item-icon">
                <span className="material-symbols-rounded">description</span>
              </div>
              <div className="sidebar-item-label">Chip models</div>
            </button>
            <button type="button" className="sidebar-item">
              <div className="sidebar-item-icon">
                <span className="material-symbols-rounded">terminal</span>
              </div>
              <div className="sidebar-item-label">Terminal</div>
            </button>
          </div>
          <div className="sidebar-group">
            <button type="button" className="sidebar-item">
              <div className="sidebar-item-icon">
                <span className="material-symbols-rounded">settings</span>
              </div>
              <div className="sidebar-item-label">Settings</div>
            </button>
          </div> */}
        </nav>
      </aside>
    );
  }
}
