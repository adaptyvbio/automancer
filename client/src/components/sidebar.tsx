import { Set as ImSet, List } from 'immutable';
import * as React from 'react';

import type { Host, HostSettingsRecord } from '../host';
import type { Route } from '../application';
import { ChipCondition, Chip, HostId } from '../backends/common';
import type { Draft, DraftId } from '../draft';
import * as util from '../util';
import { getChipMetadata } from '../backends/misc';

import styles from '../../styles/components/sidebar.module.scss';
import { ContextMenuArea } from './context-menu-area';


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
            children: (
              Object.values(this.props.host.state.chips)
                .filter((chip) => (chip.condition === ChipCondition.Ok)) as Chip[]
            ).map((chip) => ({
              id: chip.id,
              label: getChipMetadata(chip).title,
              route: ['chip', chip.id, 'settings'],
              routeRef: ['chip', chip.id]
            }))
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
          ] }
      ]
      : [];

    return (
      <ContextMenuArea
        createMenu={(_event) => null||[
          { id: 'devices', name: 'Devices' }
        ]}
        onSelect={() => {}}>
        <aside className={util.formatClass(styles.root, styles.rootReduced)}>
          <div className={styles.headerRoot}>
            {(hostSettingsRecord.length > 0) && (
              <select className={styles.headerSelect} value={this.props.selectedHostSettingsId ?? ''} onChange={(event) => {
                this.props.onSelectHost(event.currentTarget.value || null);
              }}>
                {!this.props.host && <option value="">–</option>}
                {hostSettingsRecord.map((hostSettings) => (
                  <option key={hostSettings.id} value={hostSettings.id}>{hostSettings.label ?? hostSettings.id}</option>
                ))}
              </select>
            )}
            <div className={styles.headerValueRoot}>
              <img src="http://localhost:8081/adaptyv.png" className={styles.headerValueIcon} />
              <div className={styles.headerValueTitle}>Setup Alpha 1</div>
              {/* <div className={styles.headerValueTitle}>{this.props.host?.state.info.name ?? '–'}</div> */}
              <div className={styles.headerValueSubtitle}>localhost:4567</div>
              {(hostSettingsRecord.length > 0) && (
                <div className={styles.headerValueExpand}>
                  <span className="material-symbols-sharp">unfold_more</span>
                </div>
              )}
            </div>
          </div>
          <nav className={styles.navRoot}>
            {groups.map((group) => (
              <div className={styles.navGroup} key={group.id}>
                {group.entries.map((entry) => {
                  return (
                    <button
                      type="button"
                      className={util.formatClass(styles.navEntryRoot, {
                        '_selected': entry.route && currentRouteList?.equals(List(entry.route)),
                        '_subselected': entry.route && currentRoute && isSuperset(currentRoute, entry.route)
                      })}
                      key={entry.id}
                      onClick={entry.onClick || ((entry.route ?? undefined) && (() => {
                        this.props.setRoute(entry.route!);
                      }))}>
                      {/* <span className={util.formatClass(styles.entryIcon, 'material-symbols-rounded')}>{entry.icon}</span> */}
                      <div className={styles.navEntryIcon}>
                        <div className="material-symbols-sharp">{entry.icon}</div>
                      </div>
                      <div className={styles.navEntryLabel}>{entry.label}</div>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className={styles.navRoot}>
            <div className={styles.navGroup}>
              <button type="button" className={util.formatClass(styles.navEntryRoot)}>
                <div className={styles.navEntryIcon}>
                  <div className="material-symbols-sharp">keyboard_double_arrow_right</div>
                </div>
                {/* <div className={styles.navEntryLabel}>{entry.label}</div> */}
              </button>
            </div>
          </div>
        </aside>
      </ContextMenuArea>
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
