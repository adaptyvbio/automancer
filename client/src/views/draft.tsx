import * as React from 'react';

import type { Host, Route } from '../application';
import { Icon } from '../components/icon';
import { DraftOverview } from '../components/draft-overview';
import { TextEditor } from '../components/text-editor';
import { VisualEditor } from '../components/visual-editor';
import { Draft, DraftPrimitive } from '../draft';
import * as util from '../util';
import { Pool } from '../util';


export interface ViewDraftProps {
  draft: Draft;
  host: Host;
  setDraft(draft: DraftPrimitive): Promise<void>;
  setRoute(route: Route): void;
}

export interface ViewDraftState {
  mode: 'overview' | 'text' | 'visual';
}

export class ViewDraft extends React.Component<ViewDraftProps, ViewDraftState> {
  pool = new Pool();

  constructor(props: ViewDraftProps) {
    super(props);

    this.state = {
      mode: 'overview'
    };
  }

  render() {
    let contents = (() => {
      switch (this.state.mode) {
        case 'overview': return (
          <DraftOverview
            draft={this.props.draft}
            host={this.props.host} />
        );

        case 'text': return (
          <TextEditor
            draft={this.props.draft}
            onSave={(source) => {
              this.pool.add(async () => {
                await this.props.setDraft({
                  id: this.props.draft.id,
                  source
                });
              });
            }} />
        );

        case 'visual': return (
          <VisualEditor
            draft={this.props.draft} />
        );
      }
    })();

    let navEntries = [
      { id: 'overview',
        label: 'Overview',
        icon: 'hexagon' },
      { id: 'text',
        label: 'Text editor',
        icon: 'code' },
      { id: 'visual',
        label: 'Visual editor',
        icon: 'imagesearch_roller' }
    ];

    return (
      <main className="vdraft-root">
        <header className="vdraft-header">
          <h1>{this.props.draft.entry?.name ?? '[Untitled]'}</h1>
          <nav className="barnav-root">
            {navEntries.map((entry) => (
              <button type="button"
                className={util.formatClass('barnav-entry', { '_selected': entry.id === this.state.mode })}
                key={entry.id}
                onClick={() => {
                  this.setState({ mode: entry.id as ViewDraftState['mode'] });
                }}>
                <div className="barnav-icon">
                  <Icon name={entry.icon} />
                </div>
                <div className="barnav-label">{entry.label}</div>
              </button>
            ))}
          </nav>
        </header>
        {contents}
      </main>
    );
  }
}
