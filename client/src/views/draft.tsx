import { ExperimentId, ProtocolBlockPath } from 'pr1-shared';
import { Component, ReactNode, createRef } from 'react';

import editorStyles from '../../styles/components/editor.module.scss';
import viewStyles from '../../styles/components/view.module.scss';

import type { Application } from '../application';
import { BlockInspector } from '../components/block-inspector';
import { Button } from '../components/button';
import { DiagnosticsReport } from '../components/diagnostics-report';
import { DraftSummary } from '../components/draft-summary';
import { ErrorBoundary } from '../components/error-boundary';
import { FileTabNav } from '../components/file-tab-nav';
import { GraphEditor } from '../components/graph-editor';
import { StartProtocolModal } from '../components/modals/start-protocol';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TextEditor } from '../components/text-editor';
import { TimeSensitive } from '../components/time-sensitive';
import { TitleBar } from '../components/title-bar';
import { BaseUrl } from '../constants';
import { Draft, DraftCompilation, DraftId } from '../draft';
import { Host } from '../host';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import * as util from '../util';
import { Pool } from '../util';
import { ViewDrafts } from './protocols';
import { analyzeBlockPath } from '../protocol';
import { GlobalContext } from '../interfaces/plugin';
import { formatAbsoluteTime, formatDuration, formatRelativeDate } from '../format';
import { ViewExperimentWrapper } from './experiment-wrapper';


export interface ViewDraftProps {
  app: Application;
  draft: Draft;
  host: Host;
}

export interface ViewDraftState {
  compilation: DraftCompilation | null;
  compiling: boolean;
  requesting: boolean;
  selectedBlockPath: ProtocolBlockPath | null;
  startModalOpen: boolean;

  draggedTrack: number | null;
  graphOpen: boolean;
  inspectorEntryId: string | null;
  inspectorOpen: boolean;
}

export class ViewDraft extends Component<ViewDraftProps, ViewDraftState> {
  private experimentIdAwaitingRedirection: ExperimentId | null = null;
  private compilationController: AbortController | null = null;
  private compilationPromise: Promise<DraftCompilation> | null = null;
  private controller = new AbortController();
  private pool = new Pool();
  private refTitleBar = createRef<TitleBar>();

  constructor(props: ViewDraftProps) {
    super(props);

    this.state = {
      compilation: null,
      compiling: props.draft.readable, // The draft will soon be compiling if it's readable.
      requesting: !props.draft.readable,
      selectedBlockPath: null,
      // selectedBlockPath: [0, 0, 0, 0, 0],
      // selectedBlockPath: [0],
      startModalOpen: false,

      draggedTrack: null,
      graphOpen: true,
      inspectorEntryId: 'inspector',
      inspectorOpen: true
    };
  }

  override componentDidMount() {
    this.props.app.shortcutManager.attach('Meta+Shift+S', () => {
      this.setState({ startModalOpen: true });
    }, { signal: this.controller.signal });

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

  override componentDidUpdate(prevProps: ViewDraftProps, prevState: ViewDraftState) {
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

    if (this.experimentIdAwaitingRedirection) {
      let experiment = this.props.host.state.experiments[this.experimentIdAwaitingRedirection];

      if (experiment.master) {
        ViewExperimentWrapper.navigate(experiment.id);
      }
    }
  }

  override componentWillUnmount() {
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

    let promise = this.props.host.client.request({
      type: 'compileDraft',
      draft: {
        id: this.props.draft.id,
        documents: [
          { id: '_',
            contents: source,
            owner: null,
            path: 'draft.yml' }
        ],
        entryDocumentId: '_'
      },
      options: {
        trusted: true
      }
    });

    this.compilationPromise = promise;

    let compilation = await promise;

    if (!compilationController.signal.aborted) {
      this.compilationController = null;

      this.setState({
        compilation,
        compiling: false
      });

      if (this.state.selectedBlockPath) {
        let currentBlock = compilation.protocol?.root;

        for (let key of this.state.selectedBlockPath) {
          if (!currentBlock) {
            this.setState({ selectedBlockPath: null });
            break;
          }

          // let currentBlockImpl = getBlockImpl(currentBlock, this.globalContext);
          // currentBlock = currentBlockImpl.getChild?.(currentBlock, key);
        }

        if (!currentBlock) {
          this.setState({ selectedBlockPath: null });
        }
      }
    }

    return compilation;
  }

  selectBlock(path: ProtocolBlockPath | null, options?: { showInspector?: unknown; }) {
    this.setState({
      selectedBlockPath: path
    });

    if (options?.showInspector) {
      this.setState({
        inspectorEntryId: 'inspector',
        inspectorOpen: true
      });
    }
  }


  override render() {
    let component: React.ReactNode;
    let subtitle: React.ReactNode | null = null;
    let subtitleVisible = false;

    let globalContext: GlobalContext = {
      app: this.props.app,
      host: this.props.host,
      pool: this.pool
    };

    if (!this.props.draft.readable && !this.state.requesting) {
      component = (
        <div className={util.formatClass(viewStyles.contents, viewStyles.blankOuter)}>
          <div className={viewStyles.blankInner}>
            <p>Please grant read and write permissions on this file to continue.</p>

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
      let summary = (
        <FilledDraftSummary
          compiling={this.state.compiling}
          compilation={this.state.compilation}
          context={globalContext}
          onStart={() => {
            this.setState({ startModalOpen: true });
          }} />
      );

      component = (
        <div className={util.formatClass(viewStyles.contents, editorStyles.root)} tabIndex={-1} onKeyDown={(event) => {
          switch (event.key) {
            case 'Escape':
              if (this.state.selectedBlockPath) {
                this.setState({
                  selectedBlockPath: null
                });
              } else if (this.state.inspectorOpen) {
                this.setState({
                  inspectorOpen: false
                });
              }

              break;

            default:
              return;
          }

          event.stopPropagation();
        }}>
          {this.state.startModalOpen && (
            <StartProtocolModal
              host={this.props.host}
              onCancel={() => void this.setState({ startModalOpen: false })}
              onSubmit={(data) => {
                this.pool.add(async () => {
                  let client = this.props.host.client;
                  let experimentId = data.experimentId ?? (await client.request({
                    type: 'createExperiment',
                    title: data.newExperimentTitle!
                  })).experimentId;

                  this.experimentIdAwaitingRedirection = experimentId;

                  try {
                    await client.request({
                      type: 'startDraft',
                      experimentId,
                      draft: {
                        id: this.props.draft.id,
                        documents: [
                          { id: '_',
                            contents: this.props.draft.item.source!,
                            owner: null,
                            path: 'draft.yml' }
                        ],
                        entryDocumentId: '_'
                      },
                      options: {
                        trusted: true
                      }
                    });
                  } catch (err) {
                    this.experimentIdAwaitingRedirection = null;
                    throw err;
                  }

                  // console.clear();
                });
              }} />
          )}

          <SplitPanels
            panels={[
              { component: (
                <div className={editorStyles.editorPanel}>
                  <FileTabNav entries={[
                    { id: '0',
                      label: 'Draft',
                      createMenu: () => [
                        { id: 'close', name: 'Close' },
                        { id: '_divider', type: 'divider' },
                        { id: 'reveal', name: 'Reveal in explorer', icon: 'folder_open' },
                        { id: 'open', name: 'Open in external editor', icon: 'code' },
                        { id: '_divider2', type: 'divider' },
                        { id: 'copy_file', name: 'Copy', icon: 'content_paste' },
                        { id: 'copy_path', name: 'Copy absolute path' },
                        { id: '_divider3', type: 'divider' },
                        { id: 'rename', name: 'Rename', icon: 'edit' },
                        { id: 'delete', name: 'Move to trash', icon: 'delete' }
                      ],
                      selected: true }
                  ]} />
                  <TextEditor
                    autoSave={false}
                    compilation={this.state.compilation}
                    draft={this.props.draft}
                    getCompilation={this.getCompilation.bind(this)}
                    save={(compilation, source) => {
                      this.pool.add(async () => {
                        await this.props.app.saveDraftSource(this.props.draft, source);
                        await this.props.app.saveDraftCompilation(this.props.draft, compilation);

                        this.refTitleBar.current!.notify();
                      });
                    }}
                    summary={!this.state.graphOpen ? summary : null} />
                </div>
              ) },
              { onToggle: (graphOpen) => void this.setState({ graphOpen }),
                open: this.state.graphOpen,
                component: (
                  <ErrorBoundary>
                    <GraphEditor
                      app={this.props.app}
                      host={this.props.host}
                      protocolRoot={this.state.compilation?.protocol?.root ?? null}
                      selectBlock={this.selectBlock.bind(this)}
                      selection={this.state.selectedBlockPath && {
                        blockPath: this.state.selectedBlockPath,
                        observed: false
                      }}
                      summary={summary} />
                  </ErrorBoundary>
                ) },
              { nominalSize: CSS.px(400),
                onToggle: (inspectorOpen) => void this.setState({ inspectorOpen }),
                open: this.state.inspectorOpen,
                component: (
                  <div>
                    <TabNav
                      activeEntryId={this.state.inspectorEntryId}
                      setActiveEntryId={(id) => void this.setState({ inspectorEntryId: id })}
                      entries={[
                        { id: 'inspector',
                          label: 'Inspector',
                          shortcut: 'I',
                          contents: () => (
                            this.state.compilation?.protocol
                              ? (
                                <ErrorBoundary>
                                  <BlockInspector
                                    app={this.props.app}
                                    blockPath={this.state.selectedBlockPath}
                                    host={this.props.host}
                                    protocol={this.state.compilation!.protocol}
                                    selectBlock={this.selectBlock.bind(this)} />
                                </ErrorBoundary>
                              )
                              : <div />
                          ) },
                        { id: 'report',
                          label: 'Report',
                          shortcut: 'R',
                          contents: () => (
                            <DiagnosticsReport
                              analysis={this.state.compilation?.analysis ?? null} />
                          ) }
                      ]} />
                  </div>
                ) }
            ]} />
          <div className={editorStyles.infobarRoot}>
            <div className={editorStyles.infobarLeft}>
              {/* {this.state.cursorPosition && (
                  <span className={editorStyles.infobarItem}>Ln {this.state.cursorPosition.lineNumber}, Col {this.state.cursorPosition.column}</span>
                )} */}
              <div>Last saved: {this.props.draft.lastModified ? new Date(this.props.draft.lastModified).toLocaleTimeString() : '–'}</div>
            </div>
            <div className={editorStyles.infobarRight}>
              {/* <div>Foo</div> */}
            </div>
          </div>
        </div>
      );


      if (this.props.draft.lastModified) {
        let lastModified = this.props.draft.lastModified;

        subtitle = (
          <TimeSensitive
            contents={() => {
              let delta = (Date.now() - lastModified);

              return (delta < 5e3)
                ? 'Just saved'
                : `Last saved ${formatRelativeDate(lastModified)}`;
              }
            }
            interval={1e3} />
        );
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
              this.setState({ inspectorOpen: !this.state.inspectorOpen });
            }
          }]}
          ref={this.refTitleBar} />
        {component}
      </main>
    );
  }


  static navigate(draftId: DraftId) {
    return navigation.navigate(`${BaseUrl}/draft/${draftId}`);
  }
}


export interface ViewDraftWrapperRoute {
  id: '_';
  params: {
    draftId: DraftId;
  };
}

export type ViewDraftWrapperProps = ViewProps<ViewDraftWrapperRoute>;

export class ViewDraftWrapper extends Component<ViewDraftWrapperProps, {}> {
  get draft() {
    return this.props.app.state.drafts[this.props.route.params.draftId];
  }

  override componentDidMount() {
    if (!this.draft) {
      ViewDrafts.navigate();
    }
  }

  override render() {
    if (!this.draft) {
      return null;
    }

    return (
      <ViewDraft
        app={this.props.app}
        draft={this.draft}
        host={this.props.host} />
    );
  }


  static hash(options: ViewHashOptions<ViewDraftWrapperRoute>) {
    return options.route.params.draftId;
  }

  static routes = [
    { id: '_', pattern: '/draft/:draftId' }
  ];
}


export function FilledDraftSummary(props: {
  compilation: DraftCompilation | null;
  compiling: boolean;
  context: GlobalContext;
  onStart(): void;
}) {
  if (props.compiling) {
    return <DraftSummary status="default" title="Compiling" />;
  }

  let compilation = props.compilation!;
  let errorCount = compilation.analysis.errors.length;
  let warningCount = compilation.analysis.warnings.length;

  let onStart = compilation.valid
    ? props.onStart
    : null;

  let warningText = (warningCount > 0)
    ? `${warningCount} warning${warningCount > 1 ? 's' : ''}`
    : null;


  let etaText: ReactNode | null = null;

  if (compilation.protocol) {
    let analysis = analyzeBlockPath(compilation.protocol, null, [], props.context);
    let pair = analysis.pairs[0];

    etaText = [
      formatDuration(pair.duration * 1000),
      ' (ETA ',
      <TimeSensitive
        contents={() => formatAbsoluteTime(Date.now() + pair.endTime * 1000)}
        interval={30e3}
        key={0} />,
      ')'
    ];
  } else {
    etaText = null;
  }


  if (errorCount > 0) {
    return (
      <DraftSummary
        description={warningText}
        onStart={onStart}
        status="error"
        title={`${errorCount} error${errorCount > 1 ? 's' : ''}`} />
    );
  } else if (warningText) {
    return (
      <DraftSummary
      description={etaText}
        onStart={onStart}
        status="warning"
        title={warningText} />
    );
  } else {
    return (
      <DraftSummary
        description={etaText}
        onStart={onStart}
        status="success"
        title="Ready" />
    );
  }
}
