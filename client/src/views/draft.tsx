import * as React from 'react';

import type { Draft, Host, Route } from '../application';
import { Icon } from '../components/icon';
import { TextEditor } from '../components/text-editor';
import * as util from '../util';
import { Pool } from '../util';


export interface ViewDraftProps {
  draft: Draft;
  host: Host;
  setDraft(draft: Draft): void;
  setRoute(route: Route): void;
}

export class ViewDraft extends React.Component<ViewDraftProps> {
  pool = new Pool();

  render() {
    return (
      <main className="teditor-root">
        <h1>{this.props.draft.name}</h1>

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
      </main>
    );
  }
}
