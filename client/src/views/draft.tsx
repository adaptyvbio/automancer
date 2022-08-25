import * as React from 'react';

import type { Application, Route } from '../application';
import { Icon } from '../components/icon';
import { DraftOverview } from '../components/draft-overview';
import { TextEditor } from '../components/text-editor';
import { VisualEditor } from '../components/visual-editor';
import { Draft, DraftId, DraftPrimitive } from '../draft';
import { Host } from '../host';
import { Pool } from '../util';
import { BarNav } from '../components/bar-nav';


export type ViewDraftMode = 'overview' | 'text' | 'visual';

export interface ViewDraftProps {
  app: Application;
  draft: Draft;
  host: Host;
  mode: ViewDraftMode;
  setRoute(route: Route): void;
}

export interface ViewDraftState {
  requesting: boolean;
}

export class ViewDraft extends React.Component<ViewDraftProps, ViewDraftState> {
  controller = new AbortController();
  pool = new Pool();

  constructor(props: ViewDraftProps) {
    super(props);

    this.state = {
      requesting: !props.draft.readable
    };
  }

  componentDidMount() {
    this.props.app.watchDraft(this.props.draft.id, { signal: this.controller.signal });

    this.pool.add(async () => {
      if (!this.props.draft.item.readable) {
        await this.props.draft.item.request();
      }

      if (this.state.requesting) {
        this.setState({ requesting: false });
      }

      if (this.props.draft.item.readable) {
        // Trigger an initial compilation with analysis.
        this.props.app.setDraft(this.props.draft, { skipAnalysis: false });
      }
    });
  }

  componentDidUpdate(prevProps: ViewDraftProps, prevState: ViewDraftState) {
    // Trigger a compilation if the external revision changed.
    if (this.props.draft.revision !== prevProps.draft.revision) {
      this.pool.add(async () => {
        this.props.app.setDraft(this.props.draft, { skipAnalysis: false });
      });
    }
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  render() {
    console.log('Render', this.props.draft);

    let component = (() => {
      if (!this.props.draft.readable && !this.state.requesting) {
        return (
          <div className="blayout-contents">
            <div className="blayout-blank-outer">
              <div className="blayout-blank-inner">
                <button type="button" className="btn" onClick={() => {
                  this.pool.add(async () => {
                    await this.props.draft.item.request();

                    if (this.props.draft.item.readable) {
                      this.props.app.setDraft(this.props.draft, { skipAnalysis: false });
                    }
                  });
                }}>Open protocol</button>
              </div>
            </div>
          </div>
        );
      } else if (!this.props.draft.compilation || this.state.requesting) {
        return (
          <div className="blayout-contents" />
        );
      }


      switch (this.props.mode) {
        case 'overview': return (
          <DraftOverview
            draft={this.props.draft}
            host={this.props.host}
            setRoute={this.props.setRoute} />
        );

        case 'text': return (
          <TextEditor
            draft={this.props.draft}
            onSave={(source) => {
              this.props.app.setDraft(this.props.draft, { skipAnalysis: false, source });
            }} />
        );

        case 'visual': return (
          <VisualEditor
            draft={this.props.draft} />
        );
      }
    })();

    return (
      <main className="blayout-container">
        <header className="blayout-header">
          <h1>{this.props.draft.name ?? '[Untitled]'}</h1>
          <BarNav
            entries={[
              { id: 'overview',
                label: 'Overview',
                icon: 'hexagon' },
              { id: 'text',
                label: 'Code editor',
                icon: 'code' }
              // { id: 'visual',
              //   label: 'Visual editor',
              //   icon: 'imagesearch_roller' }
            ]}
            selectEntry={(mode) => {
              this.props.setRoute(['protocol', this.props.draft.id, mode]);
            }}
            selectedEntryId={this.props.mode} />
        </header>

        {component}
      </main>
    );
  }
}
