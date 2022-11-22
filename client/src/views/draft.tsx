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
  compiling: boolean;
  requesting: boolean;
}

export class ViewDraft extends React.Component<ViewDraftProps, ViewDraftState> {
  compilationController: AbortController | null = null;
  compilationPromise: Promise<DraftCompilation> | null = null;
  controller = new AbortController();
  pool = new Pool();

  constructor(props: ViewDraftProps) {
    super(props);

    this.state = {
      compilation: null,
      compiling: false,
      requesting: !props.draft.readable
    };
  }

  componentDidMount() {
    this.pool.add(async () => {
      // This immediately updates item.readable, item.writable and item.lastModified
      // and calls setState() to update the analoguous properties on draft.
      await this.props.app.watchDraft(this.props.draft.id, { signal: this.controller.signal });

      if (!this.props.draft.item.readable) {
        await this.props.draft.item.request!();
      }

      if (this.state.requesting) {
        this.setState({ requesting: false });
      }

      if (this.props.draft.item.readable) {
        await this.getCompilation();
      }
    });
  }

  componentDidUpdate(prevProps: ViewDraftProps, prevState: ViewDraftState) {
    // Trigger a compilation if the external revision changed.
    // if (prevProps.draft.revision && (this.props.draft.revision !== prevProps.draft.revision)) {
    //   this.pool.add(async () => {
    //     await this.compile({ global: true });
    //   });
    // }

    // TODO: Handle unsaved drafts
    // if (this.props.host.state.info.instanceRevision !== prevProps.host.state.info.instanceRevision) {
    //   this.pool.add(async () => {
    //     await this.compile({ global: true });
    //   });
    // }
  }

  componentWillUnmount() {
    this.controller.abort();
  }


  async getCompilation(options?: { global?: boolean; source?: string; }) {
    let source;

    if (options?.source === undefined) {
      if (this.compilationPromise) {
        return this.compilationPromise;
      }

      if (this.state.compilation) {
        return this.state.compilation;
      }

      source = this.props.draft.item.source!;
    } else {
      source = options.source;
    }

    if (this.compilationController) {
      this.compilationController.abort();
    }

    let compilationController = new AbortController();
    this.compilationController = compilationController;

    this.setState((state) => !state.compiling ? { compiling: true } : null);

    let promise = this.props.host.backend.compileDraft({
      draftId: this.props.draft.id,
      source
    });

    this.compilationPromise = promise;

    let compilation = await promise;

    if (!compilationController.signal.aborted) {
      this.compilationController = null;
      this.compilationPromise = null;

      this.setState({
        compilation,
        compiling: false
      });

      // if (options.global) {
      //   await this.props.app.saveDraftCompilation(this.props.draft, compilation);
      // }
    }

    return compilation;
  }

  render() {
    // console.log('Render', this.props.draft);

    let component = (() => {
      if (!this.props.draft.readable && !this.state.requesting) {
        return (
          <div className="blayout-contents">
            <div className="blayout-blank-outer">
              <div className="blayout-blank-inner">
                <button type="button" className="btn" onClick={() => {
                  this.pool.add(async () => {
                    await this.props.draft.item.request!();

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
      } else if (this.state.requesting || (this.props.draft.revision === 0)) {
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
            compile={async (source: string) => {
              return await this.compile({ global: false, source });
            }}
            getCompilation={this.getCompilation.bind(this)}
            onChange={(source) => {
              // console.log('[TX] Change');

              this.pool.add(async () => {
                await this.compile({ global: false, source });
              });
            }}
            onChangeSave={(source) => {
              // console.log('[TX] Change+save');

              this.pool.add(async () => {
                await Promise.all([
                  await this.props.app.saveDraftSource(this.props.draft, source),
                  await this.compile({ global: true, source })
                ]);
              });
            }}
            onSave={(source) => {
              // console.log('[TX] Save');
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
          <h1>{this.state.compilation?.protocol?.name ?? this.props.draft.name ?? '[Untitled]'} {this.state.compiling ? '(compiling)' : ''}</h1>
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
