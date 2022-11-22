import * as React from 'react';

import type { Application, Route } from '../application';
import type { Host } from '../host';
import type { Draft, DraftId, DraftPrimitive } from '../draft';
import { ContextMenuArea, ContextMenuAreaProps } from '../components/context-menu-area';
import { Icon } from '../components/icon';
import { TitleBar } from '../components/title-bar';
import * as util from '../util';
import { Pool } from '../util';
import { analyzeProtocol } from '../analysis';
import { formatDuration } from '../format';

import viewStyles from '../../styles/components/view.module.scss';


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
      <main className={viewStyles.root}>
        <TitleBar title="Protocols" />
        <div className={util.formatClass(viewStyles.contents, viewStyles.legacy)}>
          <header className="header header--1">
            <h1>Protocols</h1>
          </header>

          <div className="lproto-container">
            <header className="header header--2">
              <h2>All protocols</h2>
              <div className="actions">
                <button type="button" className="btn" onClick={() => {
                  this.pool.add(async () => {
                    let draftId = await this.props.app.createDraft({ directory: false });

                    if (draftId) {
                      this.props.setRoute(['protocol', draftId, 'overview']);
                    }
                  });
                }}>New file</button>
                <button type="button" className="btn" onClick={() => {
                  this.pool.add(async () => {
                    let draftId = await this.props.app.loadDraft({ directory: false });

                    if (draftId) {
                      this.props.setRoute(['protocol', draftId, 'overview']);
                    }
                  });
                }}>Open file</button>
              </div>
            </header>

            <div className="lproto-list">
              {drafts.map((draft) => {
                let analysis = draft.compilation?.protocol && analyzeProtocol(draft.compilation.protocol);

                return (
                  <DraftEntry
                    name={draft.name ?? '[Untitled]'}
                    properties={[
                      ...(draft.item.locationInfo
                        ? [{ id: 'location', label: draft.item.locationInfo.name, icon: { directory: 'folder', file: 'description' }[draft.item.locationInfo.type] }]
                        : []),
                      ...(draft.item.lastModified
                        ? [{ id: 'lastModified', label: 'Last modified ' + rtf.format(Math.round((draft.item.lastModified - Date.now()) / 3600e3 / 24), 'day'), icon: 'calendar_today' }]
                        : []),
                      ...(draft.compilation
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
                      // { id: 'open-readonly', name: 'Open in read-only mode' },
                      // { id: '_divider1', type: 'divider' },
                      { id: 'reveal', name: 'Reveal in explorer', icon: 'folder_open', disabled: !draft.item.revealFile },
                      { id: 'open', name: 'Open in external editor', icon: 'code', disabled: !draft.item.openFile },
                      { id: '_divider2', type: 'divider' },
                      // { id: 'download', name: 'Download', icon: 'download', disabled: true },
                      { id: 'save', name: 'Save as...', icon: 'save', disabled: true },
                      { id: '_divider3', type: 'divider' },
                      { id: 'remove', name: 'Remove from list', icon: 'highlight_off' }
                    ]}
                    onClick={() => {
                      this.props.setRoute(['protocol', draft.id, 'overview']);
                    }}
                    onSelect={(path) => {
                      switch (path.first()) {
                        case 'remove': {
                          this.pool.add(async () => {
                            await this.props.app.deleteDraft(draft.id);
                          });

                          break;
                        }

                        case 'open': {
                          this.pool.add(async () => {
                            await draft.item.openFile!();
                          });

                          break;
                        }

                        case 'reveal': {
                          this.pool.add(async () => {
                            await draft.item.revealFile!();
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
  let contents = (
    <>
      <div className="lproto-label">{props.name}</div>
      <div className="lproto-property-list">
        {props.properties.map((property) => (
          <div className="lproto-property-item" key={property.id}>
            <Icon name={property.icon} />
            <div className="lproto-property-label">{property.label}</div>
          </div>
        ))}
      </div>
      {!props.disabled && (
        <div className="lproto-action">
          <Icon name="arrow_forward" />
        </div>
      )}
    </>
  );

  return (
    <ContextMenuArea
      createMenu={props.createMenu}
      onSelect={props.onSelect}>
      {!props.disabled
        ? <button type="button" className="lproto-entry" onClick={props.onClick}>{contents}</button>
        : <div className="lproto-entry">{contents}</div>}
    </ContextMenuArea>
  );
}
