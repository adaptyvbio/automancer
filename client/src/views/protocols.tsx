import * as React from 'react';

import type { DraftEntry as DraftDatabaseEntry } from '../app-backend';
import type { Application, Host, Route } from '../application';
import type { Draft, DraftId, DraftPrimitive } from '../draft';
import { ContextMenuArea, ContextMenuAreaProps } from '../components/context-menu-area';
import { Icon } from '../components/icon';
import * as util from '../util';
import { Pool } from '../util';
import { analyzeProtocol } from '../analysis';
import { formatDuration } from '../format';


const rtf = new Intl.RelativeTimeFormat('en', {
  localeMatcher: 'best fit',
  numeric: 'auto',
  style: 'long'
});


export interface ViewProtocolsProps {
  app: Application;
  drafts: Record<DraftId, Draft>;
  host: Host;
  setRoute(route: Route): void;
}

export class ViewProtocols extends React.Component<ViewProtocolsProps> {
  pool = new Pool();

  render() {
    let drafts = Object.values(this.props.drafts);

    return (
      <main>
        <header className="header header--1">
          <h1>Protocols</h1>
        </header>

        <div className="lproto-container">
          <header className="header header--2">
            <h2>All protocols</h2>
            <div className="actions">
              <button type="button" className="btn" onClick={() => {
                this.pool.add(async () => {
                  let sample = await this.props.host.backend.createDraftSample();
                  let draftId = await this.props.app.appBackend.createDraft(sample);

                  if (draftId) {
                    this.props.setRoute(['protocol', draftId, 'overview']);
                  }
                });
              }}>New file</button>
              <button type="button" className="btn" onClick={() => {
                this.pool.add(async () => {
                  let draftId = await this.props.app.appBackend.loadDraft();

                  if (draftId) {
                    this.props.setRoute(['protocol', draftId, 'overview']);
                  }
                });
              }}>Open file</button>
            </div>
          </header>

          <div className="lproto-list">
            {drafts.map((draft) => {
              let analysis = draft.compiled?.protocol && analyzeProtocol(draft.compiled.protocol);

              return (
                <DraftEntry
                  name={draft.item.name ?? '[Untitled]'}
                  properties={[
                    ...(draft.item.locationInfo
                      ? [{ id: 'location', label: draft.item.locationInfo.name, icon: { directory: 'folder', file: 'description' }[draft.item.locationInfo.type] }]
                      : []),
                    ...(draft.item.lastModified
                      ? [{ id: 'lastModified', label: 'Last modified ' + rtf.format(Math.round((draft.item.lastModified - Date.now()) / 3600e3 / 24), 'day'), icon: 'calendar_today' }]
                      : []),
                    ...(draft.compiled
                      ? [analysis
                        ? { id: 'display', label: formatDuration(analysis.done.time), icon: 'schedule' }
                        : { id: 'status', label: 'Error', icon: 'error' }]
                      : [])
                  ]}
                  createMenu={() => [
                    // { id: 'chip', name: 'Open chip', icon: 'memory' },
                    // { id: 'duplicate', name: 'Duplicate', icon: 'file_copy' },
                    // { id: '_divider', type: 'divider' },
                    // { id: 'archive', name: 'Archive', icon: 'archive' },
                    ...((draft.item.kind === 'ref')
                      ? [{ id: 'remove', name: 'Remove from list', icon: 'highlight_off' }]
                      : [{ id: 'delete', name: 'Delete', icon: 'delete' }])
                  ]}
                  onClick={() => {
                    this.props.setRoute(['protocol', draft.id, 'overview']);
                  }}
                  onSelect={(path) => {
                    switch (path.first()) {
                      case 'delete':
                      case 'remove': {
                        this.pool.add(async () => {
                          await this.props.app.appBackend.deleteDraft(draft.id);
                        });

                        break;
                      }
                    }
                  }}
                  key={draft.id} />
              );
            })}
          </div>
        </div>
      </main>
    );
  }
}


export function DraftEntry(props: ContextMenuAreaProps & {
  disabled?: unknown;
  name: string;
  properties: {
    id: string;
    label: string;
    icon: string;
  }[];
  onClick?(event: React.SyntheticEvent): void;
}) {
  return (
    <ContextMenuArea
      createMenu={props.createMenu}
      onSelect={props.onSelect}>
      <button type="button" className="lproto-entry" disabled={!!props.disabled} onClick={props.onClick}>
        <div className="lproto-label">{props.name}</div>
        <div className="lproto-property-list">
          {props.properties.map((property) => (
            <div className="lproto-property-item" key={property.id}>
              <Icon name={property.icon} />
              <div className="lproto-property-label">{property.label}</div>
            </div>
          ))}
        </div>
        <div className="lproto-action-item">
          <Icon name="arrow_forward" />
        </div>
      </button>
    </ContextMenuArea>
  );
}
