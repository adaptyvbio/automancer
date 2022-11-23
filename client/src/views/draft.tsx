import * as React from 'react';
import Split from 'react-split-grid';

import type { Application, Route } from '../application';
import { Icon } from '../components/icon';
import { DraftOverview } from '../components/draft-overview';
import { TextEditor } from '../components/text-editor';
import { VisualEditor } from '../components/visual-editor';
import { Draft, DraftCompilation, DraftId, DraftPrimitive } from '../draft';
import { Host } from '../host';
import { Pool } from '../util';
import { BarNav } from '../components/bar-nav';
import { TitleBar } from '../components/title-bar';
import { Button } from '../components/button';
import * as util from '../util';
import { GraphEditor } from '../components/graph-editor';
import viewStyles from '../../styles/components/view.module.scss';
import { TabNav } from '../components/tab-nav';
import * as format from '../format';

import editorStyles from '../../styles/components/editor.module.scss';
import diagnosticsStyles from '../../styles/components/diagnostics.module.scss';
import formStyles from '../../styles/components/form.module.scss';


export interface ViewDraftProps {
  app: Application;
  draft: Draft;
  host: Host;
  setRoute(route: Route): void;
}

export interface ViewDraftState {
  compilation: DraftCompilation | null;
  compiling: boolean;
  requesting: boolean;

  draggedTrack: number | null;
  inspectorOpen: boolean;
}

export class ViewDraft extends React.Component<ViewDraftProps, ViewDraftState> {
  compilationController: AbortController | null = null;
  compilationPromise: Promise<DraftCompilation> | null = null;
  controller = new AbortController();
  pool = new Pool();
  refSplit = React.createRef<HTMLDivElement>();
  refTitleBar = React.createRef<TitleBar>();

  constructor(props: ViewDraftProps) {
    super(props);

    this.state = {
      compilation: null,
      compiling: props.draft.readable, // The draft will soon be compiling if it's readable.
      requesting: !props.draft.readable,

      draggedTrack: null,
      inspectorOpen: false
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

    // this.updateInspectorOpen();
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
        return await this.compilationPromise;
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


  getGridTemplate() {
    return this.refSplit.current!.computedStyleMap().get('grid-template-columns').toString().split(' ').map((item) => CSSNumericValue.parse(item));
  }

  setGridTemplate(template: CSSNumericValue[]) {
    this.refSplit.current!.style.setProperty('grid-template-columns', template.map((item) => item.toString()).join(' '));
  }

  updateInspectorOpen() {
    let gridTemplate = this.getGridTemplate();
    let inspectorOpen = gridTemplate[4].value > 1e-9;

    if (this.state.inspectorOpen !== inspectorOpen) {
      this.setState({ inspectorOpen });
    }
  }

  render() {
    let component;
    let subtitle: string | null = null;
    let subtitleVisible = false;

    if (!this.props.draft.readable && !this.state.requesting) {
      component = (
        <div className={util.formatClass(viewStyles.contents, viewStyles.blankOuter)}>
          <div className={viewStyles.blankInner}>
            <p>Please grant the read and write permissions on this file to continue.</p>

            <div className={viewStyles.blankActions}>
              <Button onClick={() => {
                this.pool.add(async () => {
                  await this.props.draft.item.request!();

                  // if (this.props.draft.item.readable) {
                  //   this.pool.add(async () => {
                  //     await this.compile({ global: true });
                  //   });
                  // }
                });
              }}>Open protocol</Button>
            </div>
          </div>
        </div>
      );

      subtitle = 'Permission required';
      subtitleVisible = true;
    } else if (this.state.requesting || (this.props.draft.revision === 0)) {
      component = (
        <div className={viewStyles.contents} />
      );
    } else {
      component = (
        <div className={util.formatClass(viewStyles.contents, editorStyles.root)}>
          <Split
            onDragStart={(_direction, track) => {
              this.setState({ draggedTrack: track });
            }}
            onDragEnd={() => {
              this.setState({ draggedTrack: null });
              this.updateInspectorOpen();
            }}
            snapOffset={200}
            render={({
              getGridProps,
              getGutterProps,
            }) => (
              <div className={editorStyles.panels} {...getGridProps()} ref={this.refSplit}>
                <TextEditor
                  autoSave={false}
                  compilation={this.state.compilation}
                  compiling={this.state.compiling}
                  draft={this.props.draft}
                  getCompilation={this.getCompilation.bind(this)}
                  save={(compilation, source) => {
                    this.pool.add(async () => {
                      await this.props.app.saveDraftSource(this.props.draft, source);
                      await this.props.app.saveDraftCompilation(this.props.draft, compilation);

                      this.refTitleBar.current!.notify();
                    });
                  }} />
                <div className={util.formatClass({ '_dragging': this.state.draggedTrack === 1 })} {...getGutterProps('column', 1)} />
                <GraphEditor
                  host={this.props.host}
                  tree={this.state.compilation?.protocol?.root ?? null} />
                <div className={util.formatClass({ '_dragging': this.state.draggedTrack === 3 })} {...getGutterProps('column', 3)} />
                <div>
                  <TabNav entries={[
                    { id: 'report',
                      label: 'Report',
                      contents: () => (
                        <div className={util.formatClass(formStyles.main2)}>
                          {this.state.compilation && (
                            <div className={diagnosticsStyles.list}>
                              {this.state.compilation.diagnostics.map((diagnostic, index) => (
                                <div className={util.formatClass(diagnosticsStyles.entryRoot, {
                                  error: diagnosticsStyles.entryRootError,
                                  warning: diagnosticsStyles.entryRootWarning
                                }[diagnostic.kind])} key={index}>
                                  <Icon name={{ error: 'report', warning: 'warning' }[diagnostic.kind]} className={diagnosticsStyles.entryIcon} />
                                  <div className={diagnosticsStyles.entryTitle}>{diagnostic.message}</div>
                                  {/* <button type="button" className={diagnosticsStyles.entryLocation}>foo.yml 13:8</button> */}
                                  {/* <p className={diagnosticsStyles.entryDescription}>This line contains a syntax error. See the <a href="#">documentation</a> for details.</p> */}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) },
                    { id: 'parameters',
                      label: 'Parameters',
                      contents: () => <div /> }
                  ]} />
                </div>
              </div>
            )} />
          <div className={editorStyles.infobarRoot}>
            <div className={editorStyles.infobarLeft}>
              {/* {this.state.cursorPosition && (
                  <span className={editorStyles.infobarItem}>Ln {this.state.cursorPosition.lineNumber}, Col {this.state.cursorPosition.column}</span>
                )} */}
              <div>Last saved: {this.props.draft.lastModified ? new Date(this.props.draft.lastModified).toLocaleTimeString() : '–'}</div>
            </div>
            <div className={editorStyles.infobarRight}>
              <div>Foo</div>
            </div>
          </div>
        </div>
      );


      if (this.props.draft.lastModified) {
        let delta = Date.now() - this.props.draft.lastModified;

        if (delta < 5e3) {
          subtitle = 'Just saved';
        } else {
          subtitle = `Last saved ${format.formatRelativeDate(this.props.draft.lastModified)}`;
        }
      } else {
        subtitle = null;
      }
    }

    return (
      <main className={viewStyles.root}>
        <TitleBar
          title={this.state.compilation?.protocol?.name ?? this.props.draft.name ?? '[Untitled]'}
          subtitle={subtitle}
          subtitleVisible={subtitleVisible}
          tools={[{
            id: 'inspector',
            active: this.state.inspectorOpen,
            icon: 'view_week',
            onClick: () => {
              let inspectorOpen = !this.state.inspectorOpen;
              this.setState({ inspectorOpen });

              let gridTemplate = this.getGridTemplate();

              if (inspectorOpen) {
                gridTemplate[4] = CSSNumericValue.parse('300px');
              } else {
                gridTemplate[4] = CSSNumericValue.parse('0px');
              }

              this.setGridTemplate(gridTemplate);
            }
          }]}
          ref={this.refTitleBar} />
        {component}
      </main>
    );
  }


/*   _render() {
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
  } */
}
