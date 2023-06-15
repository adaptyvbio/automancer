import * as monaco from 'monaco-editor';
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
import { TabNav } from '../components/tab-nav';
import { BlockInspector } from '../components/block-inspector';
import * as format from '../format';
import { Protocol, ProtocolBlockPath } from '../interfaces/protocol';
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
import { formatDigitalDate, formatDurationTerm, formatTimeDifference } from '../format';
import { ViewExperimentWrapper } from './experiment-wrapper';
import { DraftDocument, DraftDocumentId, DraftDocumentSnapshot, DraftDocumentWatcher, DraftInstanceSnapshot } from '../app-backends/base';
import { DraftLanguageAnalysis, HostDraftCompilerResult } from '../interfaces/draft';
import { DocumentEditor } from '../components/document-editor';
import { TimeSensitive } from '../components/time-sensitive';


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
  compilation: {
    protocol: Protocol | null;
    valid: boolean;
  } | null;
  compiling: boolean;
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

    let documentItems = [entryDocumentItem].map((documentItem) => ({
      ...documentItem,
      model: (!documentItem.model && documentItem.snapshot.source)
        ? monaco.editor.createModel(documentItem.snapshot.source.contents, 'prl')
        : documentItem.model
    }));

    this.state = {
      documentItems,

      compilation: null,
      compiling: true, // The draft will soon be compiling if it's readable.
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
            documentItem.meta.updated = true;

            return {
              ...documentItem,
              model: (!documentItem.model && snapshot.source)
                ? monaco.editor.createModel(snapshot.source.contents, 'prl')
                : documentItem.model,
              snapshot
            };
          } else {
            return documentItem;
          }
        })
      }));
    }, { signal: this.controller.signal });
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

      // This immediately updates item.readable, item.writable and item.lastModified
      // and calls setState() to update the analoguous properties on draft.
      // await this.props.app.watchDraft(this.props.draft.id, { signal: this.controller.signal });

      // if (!this.props.draft.item.readable) {
      //   await this.props.draft.item.request!();
      // }

      // if (this.state.requesting) {
      //   this.setState({ requesting: false });
      // }

      // if (this.props.draft.item.readable) {
      //   await this.getCompilation();
      // }
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


  async getCompilation() {
    let updated = this.state.documentItems.some((item) => item.meta.updated)

    if (!updated && this.compilationPromise) {
      return await this.compilationPromise;
    }

    if (this.compilationController) {
      this.compilationController.abort();
    }

    this.compilationPromise = this._getCompilation();
    return await this.compilationPromise;
  }

  // getCompilationFromDocument() {
  // }

  async _getCompilation() {
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
              contents: item.meta.updated
                ? item.model!.getValue()
                : null,
              path: item.snapshot.path
            }))
          },
          options: {
            trusted: true
          }
        }
      });

      let addedDocument = false;

      for (let documentPath of result.missingDocumentPaths) {
        let document = await this.props.draft.model.getDocument(documentPath);

        if (document) {
          await this.watcher.add(document.id);

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
      compilation: {
        protocol: result.protocol,
        valid: result.valid
      },
      compiling: false
    });

    // return result;

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

    // return compilation;
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
    } else if (selectedDocumentItem.snapshot.lastModified !== null) {
      let lastModified = selectedDocumentItem.snapshot.lastModified;

      subtitle = (
        <TimeSensitive child={() => {
          let delta = Date.now() - lastModified;

          return delta < 5e3
            ? <>Just saved</>
            : <>Last saved {format.formatRelativeDate(lastModified)}</>;
        }} />
      )
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
                      label: documentItem.snapshot.path.at(-1),
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
                    documentItem={this.state.documentItems.find((documentItem) => documentItem.snapshot.id === this.state.selectedDocumentId)!}
                    getCompilation={this.getCompilation.bind(this)} />
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
              // { onToggle: (graphOpen) => void this.setState({ graphOpen }),
              //   open: this.state.graphOpen,
              //   component: (
              //     <GraphEditor
              //       host={this.props.host}
              //       selectBlock={this.selectBlock.bind(this)}
              //       selectedBlockPath={this.state.selectedBlockPath}
              //       summary={summary}
              //       tree={this.state.compilation?.protocol?.root ?? null} />
              //   ) },
              // { nominalSize: CSSNumericValue.parse('400px'),
              //   onToggle: (inspectorOpen) => void this.setState({ inspectorOpen }),
              //   open: this.state.inspectorOpen,
              //   component: (
              //     <div>
              //       <TabNav
              //         activeEntryId={this.state.inspectorEntryId}
              //         setActiveEntryId={(id) => void this.setState({ inspectorEntryId: id })}
              //         entries={[
              //           { id: 'inspector',
              //             label: 'Inspector',
              //             contents: () => (
              //               this.state.compilation?.protocol
              //                 ? (
              //                   <BlockInspector
              //                     blockPath={this.state.selectedBlockPath}
              //                     host={this.props.host}
              //                     protocol={this.state.compilation!.protocol}
              //                     selectBlock={this.selectBlock.bind(this)} />
              //                 )
              //                 : <div />
              //             ) },
              //           { id: 'report',
              //             label: 'Report',
              //             contents: () => (
              //               <DiagnosticsReport diagnostics={this.state.compilation?.analysis.diagnostics ?? []} />
              //             ) }
              //         ]} />
              //     </div>
              //   ) }
            ]} />
          <div className={editorStyles.infobarRoot}>
            <div className={editorStyles.infobarLeft}>
              {/* {this.state.cursorPosition && (
                  <span className={editorStyles.infobarItem}>Ln {this.state.cursorPosition.lineNumber}, Col {this.state.cursorPosition.column}</span>
                )} */}
              {/* <div>Last saved: {this.props.draft.lastModified ? new Date(this.props.draft.lastModified).toLocaleTimeString() : '–'}</div> */}
            </div>
            <div className={editorStyles.infobarRight}>
              <div>Foo</div>
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
