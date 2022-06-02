import * as React from 'react';

import type { Draft, Host, Route } from '../application';
import { DraftId } from '../backends/common';
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
  setDraft(draft: Draft): void;
  setRoute(route: Route): void;
}

export class ViewProtocols extends React.Component<ViewProtocolsProps> {
  render() {
    let drafts = Object.values(this.props.drafts);

    return (
      <main>
        <h1>Protocols</h1>

        <div className="header2">
          <h2>Recent protocols</h2>
          <button type="button" className="btn" onClick={() => {
            let draft: Draft = {
              id: crypto.randomUUID(),
              name: 'Untitled protocol',
              lastModified: Date.now(),
              source: `name: Untitled protocol\n`,
              compiled: null,
              location: { type: 'memory' }
            };

            this.props.setDraft(draft);
            this.props.setRoute(['protocol', draft.id]);
          }}>
            <div>New protocol</div>
          </button>
        </div>

        <div className="lproto-root">
          <button type="button" className="lproto-entry">
            <div className="lproto-label">Cell-free chip</div>
            <div className="lproto-sublabel">Last modified 6 days ago</div>
            {/* <div className="lproto-icon">
              <Icon name="chevron_right" />
            </div> */}
          </button>
        </div>

        <div className="header2">
          <h2>All protocols</h2>
        </div>


        {(drafts.length > 0)
          ? (
            <div className="lproto-root">
              {drafts.map((draft) => (
                <button type="button" className="lproto-entry" key={draft.id} onClick={() => {
                  this.props.setRoute(['protocol', draft.id]);
                }}>
                  <div className="lproto-label">{draft.name}</div>
                  <div className="lproto-sublabel">Last modified {rtf.format(Math.round((draft.lastModified - Date.now()) / 3600e3 / 24), 'day')}</div>
                </button>
              ))}
            </div>
          )
          : (
            <div className="card-blank">
              <p>No protocol</p>
            </div>
          )}
      </main>
    );
  }
}
