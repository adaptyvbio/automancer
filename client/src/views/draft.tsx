import * as monaco from 'monaco-editor';
import { ExperimentId, Protocol, ProtocolBlockPath } from 'pr1-shared';
import { Component, ReactNode, createRef } from 'react';

import editorStyles from '../../styles/components/editor.module.scss';
import viewStyles from '../../styles/components/view.module.scss';

import { DraftDocumentId, DraftDocumentSnapshot, DraftDocumentWatcher, DraftInstanceSnapshot } from '../app-backends/base';
import type { Application } from '../application';
import { Button } from '../components/button';
import { DocumentEditor } from '../components/document-editor';
import { DraftSummary } from '../components/draft-summary';
import { FileTabNav } from '../components/file-tab-nav';
import { SplitPanels } from '../components/split-panels';
import { TimeSensitive } from '../components/time-sensitive';
import { TitleBar } from '../components/title-bar';
import { BaseUrl } from '../constants';
import { DraftCompilation, DraftId } from '../draft';
import { formatDigitalDate, formatDurationTerm, formatTimeDifference } from '../format';
import { Host } from '../host';
import { DraftLanguageAnalysis, HostDraftCompilerResult } from '../interfaces/draft';
import { GlobalContext } from '../interfaces/plugin';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { analyzeBlockPath } from '../protocol';
import * as util from '../util';
import { Pool } from '../util';
import { ViewExperimentWrapper } from './experiment-wrapper';
import { ViewDrafts } from './protocols';
import { GraphEditor } from '../components/graph-editor';
import { TabNav } from '../components/tab-nav';
import { ErrorBoundary } from '../components/error-boundary';
import { BlockInspector } from '../components/block-inspector';
import { DiagnosticsReport } from '../components/diagnostics-report';
import { StartProtocolModal } from '../components/modals/start-protocol';


export interface DocumentItem {
  analysis: DraftLanguageAnalysis | null;
  model: monaco.editor.ITextModel | null;
  snapshot: DraftDocumentSnapshot;
  unsaved: boolean;

  meta: {
    updated: boolean; // = Updated since the last start of a compilation.
  };
}


export interface ViewDraftProps {
  app: Application;
  draft: DraftInstanceSnapshot;
  host: Host;
}

export interface ViewDraftState {
  compilation: HostDraftCompilerResult | null;
  compiling: boolean;
  cursorPosition: monaco.Position | null;
  documentItems: DocumentItem[];
  requesting: boolean;
  selectedBlockPath: ProtocolBlockPath | null;
  selectedDocumentId: DraftDocumentId;
  startModalOpen: boolean;

  draggedTrack: number | null;
  graphOpen: boolean;
  inspectorEntryId: string | null;
  inspectorOpen: boolean;
}

export class ViewDraft extends Component<ViewDraftProps, ViewDraftState> {
  private experimentIdAwaitingRedirection: ExperimentId | null = null;
  private compilationController: AbortController | null = null;
  private compilationPromise: Promise<HostDraftCompilerResult> | null = null;
  private controller = new AbortController();
  private pool = new Pool();
  private refTitleBar = createRef<TitleBar>();
  private watcher: DraftDocumentWatcher;

  constructor(props: ViewDraftProps) {
    super(props);

    let entryDocument = this.props.app.state.documents[this.props.draft.entryDocumentId].model;
    let entryDocumentItem: DocumentItem = {
      analysis: null,
      model: null,
      snapshot: entryDocument.getSnapshot(),
      unsaved: false,

      meta: {
        updated: true
      }
    };

    let getModelOfDocumentItem = (documentItem: DocumentItem, snapshot: DraftDocumentSnapshot = documentItem.snapshot) => {
      if (documentItem.model || !snapshot.source) {
        return documentItem.model;
      }

      let model = monaco.editor.createModel(snapshot.source.contents, 'prl');
      documentItem.meta.updated = true;

      model.onDidChangeContent(() => {
        documentItem.meta.updated = true;

        // this.setState((state) => ({
        //   documentItems: state.documentItems[0]
        // }));
      });

      return model;
    };

    let documentItems = [entryDocumentItem].map((documentItem) => ({
      ...documentItem,
      model: getModelOfDocumentItem(documentItem)
    }));

    this.state = {
      documentItems,

      compilation: null,
      compiling: true, // The draft will soon be compiling if it's readable.
      cursorPosition: null,
      requesting: false,
      selectedBlockPath: null,
      selectedDocumentId: entryDocument.id,
      startModalOpen: false,

      draggedTrack: null,
      graphOpen: true,
      inspectorEntryId: 'inspector',
      inspectorOpen: true
    };

    this.watcher = this.props.app.appBackend.watchDocuments((changedDocumentIds) => {
      this.setState((state) => ({
        documentItems: state.documentItems.map((documentItem) => {
          if (changedDocumentIds.has(documentItem.snapshot.id)) {
            let snapshot = documentItem.snapshot.model.getSnapshot();

            return {
              ...documentItem,
              model: getModelOfDocumentItem(documentItem, snapshot),
              snapshot
            };
          } else {
            return documentItem;
          }
        })
      }));
    }, { signal: this.controller.signal });
  }

  get selectedDocumentItem() {
    return this.state.documentItems.find((item) => item.snapshot.id === this.state.selectedDocumentId)!;
  }

  override componentDidMount() {
    this.props.app.shortcutManager.attach('Meta+Shift+S', () => {
      this.setState({ startModalOpen: true });
    }, { signal: this.controller.signal });

    for (let { id, shortcut } of [
      { id: 'inspector', shortcut: ('E' as const) },
      { id: 'report', shortcut: ('R' as const) }
    ]) {
      this.props.app.shortcutManager.attach(shortcut, () => {
        this.setState({
          inspectorEntryId: id,
          inspectorOpen: true
        });
      }, { signal: this.controller.signal });
    }

    this.pool.add(async () => {
      await this.watcher.add(this.state.documentItems.map((item) => item.snapshot.id));
    });
  }

  override componentDidUpdate(prevProps: ViewDraftProps, prevState: ViewDraftState) {
    let selectedDocumentItem = this.state.documentItems.find((item) => item.snapshot.id === this.state.selectedDocumentId)!;
    let prevSelectedDocumentItem = prevState.documentItems.find((item) => item.snapshot.id === selectedDocumentItem.snapshot.id);

    if (prevSelectedDocumentItem) {
      let prevLastModified = prevSelectedDocumentItem.snapshot.lastModified;
      let lastModified = selectedDocumentItem.snapshot.lastModified;

      if ((prevLastModified !== null) && (lastModified !== prevLastModified)) {
        this.refTitleBar.current!.notify();
      }
    }

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


  async getCompilation() {
    let updated = this.state.documentItems.some((item) => item.meta.updated);

    for (let documentItem of this.state.documentItems) {
      documentItem.meta.updated = false;
    }

    if (updated || !this.compilationPromise) {
      if (this.compilationController) {
        this.compilationController.abort();
      }

      this.compilationPromise = this.runCompilation();
    }

    return await this.compilationPromise;
  }

  private async runCompilation() {
    let compilationController = new AbortController();
    this.compilationController = compilationController;

    this.setState((state) => !state.compiling ? { compiling: true } : null);


    let documentItems: DocumentItem[] = this.state.documentItems;
    let result: HostDraftCompilerResult;

    while (true) {
      result = await this.props.host.client.request({
        type: 'compileDraft',
        draft: {
          id: this.props.draft.id,
          documents: documentItems.map((item) => ({
            id: item.snapshot.id,
            contents: item.model!.getValue(),
            // contents: item.meta.updated
            //   ? item.model!.getValue()
            //   : null,
            path: item.snapshot.path
          })),
          entryDocumentId: this.props.draft.entryDocumentId
        },
        options: {
          trusted: true
        }
      });

      let addedDocument = false;

      for (let documentPath of result.missingDocumentPaths) {
        let document = await this.props.draft.model.getDocument(documentPath);

        if (document) {
          await this.watcher.add([document.id]);
          addedDocument = true;

          documentItems.push({
            analysis: null,
            model: null,
            snapshot: document.getSnapshot(),
            unsaved: false,

            meta: {
              updated: false
            }
          });
        }
      }

      if (addedDocument) {
        this.setState({ documentItems });
      } else {
        break;
      }
    }

    if (!compilationController.signal.aborted) {
      this.compilationController = null;
    }

    this.setState({
      compilation: result,
      compiling: false
    });

    // return result;

    // if (this.state.selectedBlockPath) {
    //   let currentBlock = compilation.protocol?.root;

    //   for (let key of this.state.selectedBlockPath) {
    //     if (!currentBlock) {
    //       this.setState({ selectedBlockPath: null });
    //       break;
    //     }

    //     // let currentBlockImpl = getBlockImpl(currentBlock, this.globalContext);
    //     // currentBlock = currentBlockImpl.getChild?.(currentBlock, key);
    //   }

    //   if (!currentBlock) {
    //     this.setState({ selectedBlockPath: null });
    //   }
    // }

    return result;
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
    // let component: React.ReactNode;
    // let subtitle: React.ReactNode | null = null;
    // let subtitleVisible = false;

    // if (!this.props.draft.readable && !this.state.requesting) {
    //   component = (
    //     <div className={util.formatClass(viewStyles.contents, viewStyles.blankOuter)}>
    //       <div className={viewStyles.blankInner}>
    //         <p>Please grant read and write permissions on this file to continue.</p>

    //         <div className={viewStyles.blankActions}>
    //           <Button onClick={() => {
    //             this.pool.add(async () => {
    //               await this.props.draft.item.request!();

    //               // if (this.props.draft.item.readable) {
    //               //   this.pool.add(async () => {
    //               //     await this.compile({ global: true });
    //               //   });
    //               // }
    //             });
    //           }}>Open protocol</Button>
    //         </div>
    //       </div>
    //     </div>
    //   );

    //   subtitle = 'Permission required';
    //   subtitleVisible = true;
    // } else if (this.state.requesting || (this.props.draft.revision === 0)) {
    //   component = (
    //     <div className={viewStyles.contents} />
    //   );
    // } else {
    //   let summary = (
    //     <FilledDraftSummary
    //       compiling={this.state.compiling}
    //       compilation={this.state.compilation}
    //       onStart={() => {
    //         this.setState({ startModalOpen: true });
    //       }} />
    //   );


    //   if (this.props.draft.lastModified) {
    //     let delta = Date.now() - this.props.draft.lastModified;

    //     if (delta < 5e3) {
    //       subtitle = 'Just saved';
    //     } else {
    //       subtitle = `Last saved ${format.formatRelativeDate(this.props.draft.lastModified)}`;
    //     }
    //   } else {
    //     subtitle = null;
    //   }
    // }

    let selectedDocumentItem = this.state.documentItems.find((item) => item.snapshot.id === this.state.selectedDocumentId)!;

    let subtitle = null;
    let subtitleVisible = false;

    let globalContext: GlobalContext = {
      app: this.props.app,
      host: this.props.host,
      pool: this.pool
    };

    if (!selectedDocumentItem.snapshot.readable) {
    // if (!this.props.draft.readable && !this.state.requesting) {
      // component = (
      //   <div className={util.formatClass(viewStyles.contents, viewStyles.blankOuter)}>
      //     <div className={viewStyles.blankInner}>
      //       <p>Please grant read and write permissions on this file to continue.</p>

      //       <div className={viewStyles.blankActions}>
      //         <Button onClick={() => {
      //           this.pool.add(async () => {
      //             await this.props.draft.item.request!();

      //             // if (this.props.draft.item.readable) {
      //             //   this.pool.add(async () => {
      //             //     await this.compile({ global: true });
      //             //   });
      //             // }
      //           });
      //         }}>Open protocol</Button>
      //       </div>
      //     </div>
      //   </div>
      // );

      subtitle = 'Permission required';
      subtitleVisible = true;
    } else if (selectedDocumentItem.snapshot.lastModified !== null) {
      let lastModified = selectedDocumentItem.snapshot.lastModified;

      subtitle = (
        <TimeSensitive
          contents={() => {
            let delta = Date.now() - lastModified;

            return (delta < 5e3)
              ? 'Just saved'
              : `Last saved ${formatTimeDifference(-delta)}`;
          }}
          interval={1e3} />
      );
    }

    let summary = (
      <FilledDraftSummary
        compiling={this.state.compiling}
        compilation={this.state.compilation}
        context={globalContext}
        onStart={() => {
          this.setState({ startModalOpen: true });
        }} />
    );

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
        <div className={util.formatClass(viewStyles.contents, editorStyles.root)}>
          {/* {this.state.startModalOpen && (
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
          )} */}

          <SplitPanels
            panels={[
              { component: (
                <div className={editorStyles.editorPanel}>
                  <FileTabNav entries={this.state.documentItems.map((documentItem, index) => {
                    let document = documentItem.snapshot.model;

                    return {
                      id: documentItem.snapshot.id,
                      label: documentItem.snapshot.path.at(-1)!,
                      unsaved: documentItem.unsaved,
                      selected: (documentItem.snapshot.id === this.state.selectedDocumentId),
                      createMenu: () => [
                        { id: 'close', name: 'Close', disabled: (index === 0) },
                        { id: '_divider', type: 'divider' },
                        { id: 'reveal', name: 'Reveal in explorer', icon: 'folder_open', disabled: !document.reveal },
                        { id: 'open', name: 'Open in external editor', icon: 'code', disabled: !document.open },
                        { id: '_divider2', type: 'divider' },
                        { id: 'copy_file', name: 'Copy', icon: 'content_paste', disabled: !documentItem.snapshot.source },
                        { id: 'copy_path', name: 'Copy absolute path' },
                        { id: '_divider3', type: 'divider' },
                        { id: 'rename', name: 'Rename', icon: 'edit' },
                        { id: 'delete', name: 'Move to trash', icon: 'delete' }
                      ],
                      onSelectMenu: (path) => {
                        switch (path.first()) {
                          case 'copy_file': {
                            let blob = new Blob([documentItem.snapshot.source!.contents], { type: 'plain/text' });

                            this.pool.add(async () => {
                              await navigator.clipboard.write([
                                new ClipboardItem({
                                  [blob.type]: blob
                                })
                              ]);
                            });
                          }
                        }
                      },
                    };
                  })} />
                  <DocumentEditor
                    autoSave={false}
                    documentItem={this.state.documentItems.find((documentItem) => documentItem.snapshot.id === this.state.selectedDocumentId)!}
                    getCompilation={this.getCompilation.bind(this)}
                    onCursorChange={(position) => {
                      this.setState({ cursorPosition: position });
                    }} />
                  {/* <TextEditor
                    autoSave={false}
                    documentItem={this.state.documentItems.find((documentItem) => documentItem.snapshot.id === this.state.selectedDocumentId)!}
                    // draft={this.props.draft}
                    getCompilation={this.getCompilation.bind(this)}
                    save={(compilation, source) => {
                      this.pool.add(async () => {
                        await this.props.app.saveDraftSource(this.props.draft, source);
                        await this.props.app.saveDraftCompilation(this.props.draft, compilation);

                        this.refTitleBar.current!.notify();
                      });
                    }}
                    summary={null} /> */}
                    {/* summary={!this.state.graphOpen ? summary : null} /> */}
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
                          shortcut: 'E',
                          contents: () => (
                            this.state.compilation?.protocol
                              ? (
                                <ErrorBoundary>
                                  <BlockInspector
                                    app={this.props.app}
                                    blockPath={this.state.selectedBlockPath}
                                    host={this.props.host}
                                    location={null}
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
              {this.state.cursorPosition && (
                <span className={editorStyles.infobarItem}>Ln {this.state.cursorPosition.lineNumber}, Col {this.state.cursorPosition.column}</span>
              )}
            </div>
            <div className={editorStyles.infobarRight}>
              <div>Last saved: {this.selectedDocumentItem.snapshot.lastModified ? new Date(this.selectedDocumentItem.snapshot.lastModified).toLocaleTimeString() : '–'}</div>
            </div>
          </div>
        </div>
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
    let terms = pair.terms!;

    let formattedDuration = formatDurationTerm(pair.block.duration);

    if (formattedDuration !== null) {
      etaText = [formattedDuration];

      if (terms.end.type === 'duration') {
        let endTerm = terms.end;
        let now = Date.now();

        etaText = [
          formattedDuration,
          ' (ETA ',
          <TimeSensitive
            contents={() => formatDigitalDate(now + endTerm.value, now, { format: 'react' })}
            interval={30e3}
            key={0} />,
          ')'
        ];
      } else {
        etaText = formattedDuration;
      }
    } else {
      etaText = null;
    }
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
