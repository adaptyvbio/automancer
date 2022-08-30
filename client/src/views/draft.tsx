import * as React from 'react';

import type { Application, Route } from '../application';
import { Icon } from '../components/icon';
import { DraftOverview } from '../components/draft-overview';
import { TextEditor } from '../components/text-editor';
import { VisualEditor } from '../components/visual-editor';
import { Draft, DraftCompilation, DraftId, DraftPrimitive } from '../draft';
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
  compilation: DraftCompilation | null;
  requesting: boolean;
}

export class ViewDraft extends React.Component<ViewDraftProps, ViewDraftState> {
  compilationTime: number | null = null;
  controller = new AbortController();
  pool = new Pool();

  constructor(props: ViewDraftProps) {
    super(props);

    this.state = {
      compilation: props.draft.compilation,
      requesting: !props.draft.readable
    };
  }

  componentDidMount() {
    this.pool.add(async () => {
      // This immediately updates item.readable, item.writable and item.lastModified
      // and calls setState() to update the analoguous properties on draft.
      // await this.props.app.watchDraft(this.props.draft.id, { signal: this.controller.signal });
      await this.props.app.watchDraft(this.props.draft.id, { signal: this.controller.signal });

      if (!this.props.draft.item.readable) {
        await this.props.draft.item.request();
      }

      if (this.state.requesting) {
        this.setState({ requesting: false });
      }

      // Trigger a compilation if the last compilation is outdated.
      if (this.props.draft.item.readable) {
        await this.compile({ global: true });
      }
    });
  }

  componentDidUpdate(prevProps: ViewDraftProps, prevState: ViewDraftState) {
    // Trigger a compilation if the external revision changed.
    if (prevProps.draft.revision && (this.props.draft.revision !== prevProps.draft.revision)) {
      this.pool.add(async () => {
        await this.compile({ global: true });
      });
    }

    // TODO: Handle unsaved drafts
    if (this.props.host.state.info.instanceRevision !== prevProps.host.state.info.instanceRevision) {
      this.pool.add(async () => {
        await this.compile({ global: true });
      });
    }
  }

  componentWillUnmount() {
    this.controller.abort();
  }


  async compile(options: { global: boolean; source?: string; }) {
    let compilationTime = Date.now();
    this.compilationTime = compilationTime;

    let compilation = await this.props.host.backend.compileDraft({
      draftId: this.props.draft.id,
      source: options.source ?? this.props.draft.item.source!
    });

    if (compilationTime === this.compilationTime) {
      this.setState({ compilation });

      if (options.global) {
        await this.props.app.saveDraftCompilation(this.props.draft, compilation);
      }
    }
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
                      this.pool.add(async () => {
                        await this.compile({ global: true });
                      });
                    }
                  });
                }}>Open protocol</button>
              </div>
            </div>
          </div>
        );
      } else if (this.state.requesting) {
        return (
          <div className="blayout-contents" />
        );
      }


      switch (this.props.mode) {
        case 'overview': return (
          <DraftOverview
            compilation={this.state.compilation}
            draft={this.props.draft}
            host={this.props.host}
            setRoute={this.props.setRoute} />
        );

        case 'text': return (
          <TextEditor
            autoSave={false}
            compilation={this.state.compilation}
            draft={this.props.draft}
            onChange={(source) => {
              console.log('[TX] Change');

              this.pool.add(async () => {
                await this.compile({ global: false, source });
              });
            }}
            onChangeSave={(source) => {
              console.log('[TX] Change+save');

              this.pool.add(async () => {
                await Promise.all([
                  await this.props.app.saveDraftSource(this.props.draft, source),
                  await this.compile({ global: true, source })
                ]);
              });
            }}
            onSave={(source) => {
              console.log('[TX] Save');
              this.pool.add(async () => {
                if (this.state.compilation) {
                  // TODO: Fix this
                  await this.props.app.saveDraftCompilation(this.props.draft, this.state.compilation);
                }

                await this.props.app.saveDraftSource(this.props.draft, source);
              });
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
          <h1>{this.state.compilation?.protocol?.name ?? this.props.draft.name ?? '[Untitled]'}</h1>
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
