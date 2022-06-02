import * as React from 'react';

import type { Draft, Host, Route } from '../application';
import { Icon } from '../components/icon';
import { DraftOverview } from '../components/draft-overview';
import { TextEditor } from '../components/text-editor';
import * as util from '../util';
import { Pool } from '../util';


export interface ViewDraftProps {
  draft: Draft;
  host: Host;
  setDraft(draft: Draft): void;
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
        )
        case 'text': return (
          <TextEditor
            draft={this.props.draft}
            onSave={(source) => {
              this.props.setDraft({
                ...this.props.draft,
                compiled: null,
                lastModified: Date.now(),
                source
              });

              this.pool.add(async () => {
                let compiled = await this.props.host.backend.compileDraft(this.props.draft.id, source);

                this.props.setDraft({
                  ...this.props.draft,
                  compiled,
                  name: compiled?.protocol?.name ?? this.props.draft.name
                });
              });
            }} />
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
          <h1>{this.props.draft.name}</h1>
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
            {/* <button type="button" className="barnav-entry _selected">
              <div className="barnav-icon">
                <Icon name="hexagon" />
              </div>
              <div className="barnav-label">Overview</div>
            </button>
            <button type="button" className="barnav-entry">
              <div className="barnav-icon">
                <Icon name="code" />
              </div>
              <div className="barnav-label">Text editor</div>
            </button>
            <button type="button" className="barnav-entry">
              <div className="barnav-icon">
                <Icon name="imagesearch_roller" />
              </div>
              <div className="barnav-label">Visual editor</div>
            </button> */}
          </nav>
        </header>
        {contents}
      </main>
    );
  }
}
