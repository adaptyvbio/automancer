import * as React from 'react';

import type { Host, Route } from '../application';
import type { Draft, DraftId } from '../draft';
import { ContextMenuArea } from '../components/context-menu-area';
import { Icon } from '../components/icon';
import * as util from '../util';
import { Pool } from '../util';


const rtf = new Intl.RelativeTimeFormat('en', {
  localeMatcher: 'best fit',
  numeric: 'auto',
  style: 'long'
});


export interface ViewProtocolsProps {
  drafts: Record<DraftId, Draft>;
  host: Host;
  setDraft(draft: Draft): Promise<void>;
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

        <header className="header header--2">
          <h2>All protocols</h2>
        </header>

        <div className="lproto-root">
          {drafts.map(draft => (
            // <ContextMenuArea
            //   createMenu={() => [
            //     { id: 'chip', name: 'Open chip', icon: 'memory' },
            //     { id: 'duplicate', name: 'Duplicate', icon: 'file_copy' }
            //   ]}
            //   onSelect={(path) => {

            //   }}
            //   key={draft.id}>
            <DraftEntry
              name={draft.name}
              properties={[
                { id: 'lastModified', label: 'Last modified ' + rtf.format(Math.round((draft.lastModified - Date.now()) / 3600e3 / 24), 'day'), icon: 'calendar_today' },
                { id: 'status', label: 'Error', icon: 'error' }
              ]}
              onClick={() => {
                this.props.setRoute(['protocol', draft.id]);
              }}
              key={draft.id} />
            // </ContextMenuArea>
          ))}
        </div>

        <header className="header header--2">
          <h2>Running protocols</h2>
          <button type="button" className="btn" onClick={() => {
            let draft: Draft = {
              id: crypto.randomUUID(),
              name: 'Untitled protocol',
              lastModified: Date.now(),
              source: `name: Untitled protocol\n`,
              compiled: null,
              location: { type: 'memory' }
            };

            this.pool.add(async () => {
              await this.props.setDraft(draft);
              this.props.setRoute(['protocol', draft.id]);
            });
          }}>
            <div>New protocol</div>
          </button>
        </header>

        <div className="lproto-root">
          {new Array(3).fill(0).map((_, index) => (
            <ContextMenuArea
              createMenu={() => [
                { id: 'chip', name: 'Open chip', icon: 'memory' },
                { id: 'duplicate', name: 'Duplicate', icon: 'file_copy' }
              ]}
              onSelect={(path) => {

              }}
              key={index}>
              <button type="button" className="lproto-entry">
                <div className="lproto-label">Cell-free chip</div>
                {/* <div className="lproto-sublabel">Running on Untitled Chip • 2:30 left</div> */}
                <div className="lproto-property-list">
                  <div className="lproto-property-item">
                    <Icon name="schedule" />
                    <div className="lproto-property-label">2 hr 30 min</div>
                  </div>
                  <div className="lproto-property-item">
                    <Icon name="memory" />
                    <div className="lproto-property-label">Chip X.3 (1:24 left)</div>
                  </div>
                </div>
                <div className="lproto-action-item">
                  {/* <div className="proto-action-label">Edit</div> */}
                  <Icon name="arrow_forward" />
                </div>
              </button>
            </ContextMenuArea>
          ))}
        </div>
      </main>
    );
  }
}


export function DraftEntry(props: {
  name: string;
  properties: {
    id: string;
    label: string;
    icon: string;
  }[];
  onClick?(event: React.SyntheticEvent): void;
}) {
  return (
    <button type="button" className="lproto-entry" onClick={props.onClick}>
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
        {/* <div className="proto-action-label">Edit</div> */}
        <Icon name="arrow_forward" />
      </div>
    </button>
  );
}
