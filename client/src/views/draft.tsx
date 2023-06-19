import * as monaco from 'monaco-editor';
import { ExperimentId, ProtocolBlockPath } from 'pr1-shared';
import { Component, ReactNode, createRef } from 'react';

import editorStyles from '../../styles/components/editor.module.scss';
import viewStyles from '../../styles/components/view.module.scss';

import { OrderedMap } from 'immutable';
import { DocumentId, DocumentSlotSnapshot, DraftInstanceId, DraftInstanceSnapshot } from '../app-backends/base';
import { Application } from '../application';
import { BlockInspector } from '../components/block-inspector';
import { DiagnosticsReport } from '../components/diagnostics-report';
import { DocumentEditor } from '../components/document-editor';
import { DraftSummary } from '../components/draft-summary';
import { ErrorBoundary } from '../components/error-boundary';
import { FileTabNav } from '../components/file-tab-nav';
import { GraphEditor } from '../components/graph-editor';
import { StartProtocolModal } from '../components/modals/start-protocol';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TimeSensitive } from '../components/time-sensitive';
import { TitleBar } from '../components/title-bar';
import { BaseUrl } from '../constants';
import { DraftCompilation } from '../draft';
import { formatDigitalDate, formatDurationTerm, formatTimeDifference } from '../format';
import { Host } from '../host';
import { HostDraftCompilerResult } from '../interfaces/draft';
import { GlobalContext } from '../interfaces/plugin';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { analyzeBlockPath } from '../protocol';
import { Pool, formatClass } from '../util';
import { ViewExperimentWrapper } from './experiment-wrapper';
import { ViewDrafts } from './protocols';


export interface DocumentItem {
  controller: AbortController;
  slotSnapshot: DocumentSlotSnapshot;
  textModel: monaco.editor.ITextModel | null;
  unsaved: boolean;

  meta: {
    currentVersionId: number | null;
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
  documentItems: OrderedMap<DocumentId, DocumentItem>;
  requesting: boolean;
  selectedBlockPath: ProtocolBlockPath | null;
  selectedDocumentId: DocumentId;
  startModalOpen: boolean;

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

  constructor(props: ViewDraftProps) {
    super(props);

    let entrySlot = this.props.draft.model.getEntryDocumentSlot();

    let entryDocumentItem: DocumentItem = {
      controller: new AbortController(),
      slotSnapshot: entrySlot.getSnapshot(),
      textModel: null,
      unsaved: false,

      meta: {
        currentVersionId: null,
        updated: true
      }
    };

    let getModelOfDocumentItem = (documentItem: DocumentItem, snapshot: DocumentSlotSnapshot = documentItem.slotSnapshot) => {
      // If the document has received an external modification
      // Then update the text model
      if (documentItem.textModel && snapshot.document && (snapshot.document.lastExternalModificationDate === snapshot.document.lastModificationDate)) {
        documentItem.meta.currentVersionId = documentItem.textModel.getVersionId() + 1;
        documentItem.meta.updated = true;

        documentItem.textModel.setValue(snapshot.document.contents!);

        this.setDocumentItem(snapshot.id, {
          unsaved: false
        });
      }

      // If the text model already exists
      if (documentItem.textModel) {
        return documentItem.textModel;
      }

      // If the document exists and its content is known
      if (snapshot.document && (snapshot.document.contents !== null)) {
        let model = monaco.editor.createModel(snapshot.document.contents, 'prl');

        documentItem.meta.updated = true;

        model.onDidChangeContent((event) => {
          if (documentItem.meta.currentVersionId !== event.versionId) {
            documentItem.meta.currentVersionId = null;
            documentItem.meta.updated = true;

            this.setDocumentItem(documentItem.slotSnapshot.id, {
              unsaved: true
            });
          }
        });

        return model;
      }

      return null;
    };

    let documentItems = OrderedMap([[entrySlot.id, entryDocumentItem]]).map((documentItem) => ({
      ...documentItem,
      textModel: getModelOfDocumentItem(documentItem)
    } satisfies DocumentItem));

    this.state = {
      documentItems,

      compilation: null,
      compiling: true, // The draft will soon be compiling if it's readable.
      cursorPosition: null,
      requesting: false,
      selectedBlockPath: null,
      selectedDocumentId: entrySlot.id,
      startModalOpen: false,

      graphOpen: true,
      inspectorEntryId: 'inspector',
      inspectorOpen: true
    };

    entrySlot.watchSnapshot((snapshot) => {
      console.log('Update', snapshot);

      let documentItem = this.state.documentItems.get(snapshot.id)!;
      let textModel = getModelOfDocumentItem(documentItem, snapshot);

      // console.log('ℹ️ Snapshot', snapshot.lastModificationDate, snapshot.lastExternalModificationDate);

      this.setDocumentItem(snapshot.id, {
        slotSnapshot: snapshot,
        textModel
      });
    });

    entrySlot.watch({ signal: entryDocumentItem.controller.signal });
  }

  get selectedDocumentItem() {
    return this.state.documentItems.find((item) => item.slotSnapshot.id === this.state.selectedDocumentId)!;
  }

  private setDocumentItem(documentId: DocumentId, patch: Partial<DocumentItem>) {
    this.setState((state) => ({
      documentItems: state.documentItems.set(documentId, {
        ...state.documentItems.get(documentId)!,
        ...patch
      })
    }));
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

    this.props.app.shortcutManager.attach('Meta+S', () => {
      let documentItem = this.selectedDocumentItem;

      if (documentItem.textModel && documentItem.slotSnapshot.document?.writable) {
        let document = documentItem.slotSnapshot.document.model;
        let contents = documentItem.textModel.getValue();

        this.pool.add(async () => {
          await document.write(contents);

          this.setDocumentItem(documentItem.slotSnapshot.id, {
            unsaved: false
          });
        });
      }
    }, { signal: this.controller.signal });
  }

  override componentDidUpdate(prevProps: ViewDraftProps, prevState: ViewDraftState) {
    let selectedDocumentItem = this.state.documentItems.find((item) => item.slotSnapshot.id === this.state.selectedDocumentId)!;
    let prevSelectedDocumentItem = prevState.documentItems.find((item) => item.slotSnapshot.id === selectedDocumentItem.slotSnapshot.id);

    if (prevSelectedDocumentItem) {
      let prevModificationDate = prevSelectedDocumentItem.slotSnapshot.document?.lastModificationDate ?? null;
      let modificationDate = selectedDocumentItem.slotSnapshot.document?.lastModificationDate ?? null;

      if ((prevModificationDate !== null) && (modificationDate !== prevModificationDate)) {
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

    for (let documentItem of this.state.documentItems.values()) {
      documentItem.controller.abort();
      documentItem.textModel?.dispose();
    }
  }


  async getCompilation() {
    let updated = this.state.documentItems.some((item) => item.meta.updated);

    for (let documentItem of this.state.documentItems.values()) {
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


    let documentItems = this.state.documentItems;
    let result: HostDraftCompilerResult;

    while (true) {
      result = await this.props.host.client.request({
        type: 'compileDraft',
        draft: {
          id: this.props.draft.id,
          documents: documentItems.valueSeq().map((documentItem) => ({
            id: documentItem.slotSnapshot.id,
            contents: documentItem.textModel!.getValue(),
            path: documentItem.slotSnapshot.path
          })).toArray(),
          entryDocumentId: this.props.draft.model.getEntryDocumentSlot().id
        },
        options: {
          trusted: true
        }
      });

      // for (let documentPath of result.missingDocumentPaths) {
      //   let document = await this.props.draft.model.getDocument(documentPath);

      //   if (document) {
      //     await this.watcher.add([document.id]);

      //     documentItems = documentItems.set(document.id, {
      //       analysis: null,
      //       textModel: null,
      //       snapshot: document.getSnapshot(),
      //       unsaved: false,

      //       meta: {
      //         updated: false
      //       }
      //     });
      //   }
      // }

      if (documentItems !== this.state.documentItems) {
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
    let selectedDocumentItem = this.state.documentItems.find((item) => item.slotSnapshot.id === this.state.selectedDocumentId)!;
    let selectedDocumentSnapshot = selectedDocumentItem.slotSnapshot.document;

    let subtitle = null;
    let subtitleVisible = false;

    let globalContext: GlobalContext = {
      app: this.props.app,
      host: this.props.host,
      pool: this.pool
    };

    if (!selectedDocumentSnapshot) {
      subtitle = 'Missing file';
      subtitleVisible = true;
    } else if (!selectedDocumentSnapshot.readable) {
      subtitle = 'Permission required';
      subtitleVisible = true;
    } else if (selectedDocumentSnapshot.lastModificationDate !== null) {
      let modificationDate = selectedDocumentSnapshot.lastModificationDate;

      subtitle = (
        <TimeSensitive
          contents={() => {
            let delta = Date.now() - modificationDate;

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
        <div className={formatClass(viewStyles.contents, editorStyles.root)}>
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
                        documents: this.state.documentItems.valueSeq().map((documentItem) => ({
                          id: documentItem.slotSnapshot.id,
                          contents: documentItem.textModel!.getValue(),
                          path: documentItem.slotSnapshot.path
                        })).toArray(),
                        entryDocumentId: this.props.draft.model.getEntryDocumentSlot().id
                      },
                      options: {
                        trusted: true
                      }
                    });
                  } catch (err) {
                    this.experimentIdAwaitingRedirection = null;
                    throw err;
                  }
                });
              }} />
          )}

          <SplitPanels
            panels={[
              { component: (
                <div className={editorStyles.editorPanel}>
                  <FileTabNav entries={this.state.documentItems.valueSeq().toArray().map((documentItem, index) => {
                    return {
                      id: documentItem.slotSnapshot.id,
                      label: documentItem.slotSnapshot.path.at(-1)!,
                      unsaved: documentItem.unsaved,
                      selected: (documentItem.slotSnapshot.id === this.state.selectedDocumentId),
                      // createMenu: () => [
                      //   { id: 'close', name: 'Close', disabled: (index === 0) },
                      //   { id: '_divider', type: 'divider' },
                      //   { id: 'reveal', name: 'Reveal in explorer', icon: 'folder_open', disabled: !document.reveal },
                      //   { id: 'open', name: 'Open in external editor', icon: 'code', disabled: !document.open },
                      //   { id: '_divider2', type: 'divider' },
                      //   { id: 'copy_file', name: 'Copy', icon: 'content_paste', disabled: !documentItem.snapshot.source },
                      //   { id: 'copy_path', name: 'Copy absolute path' },
                      //   { id: '_divider3', type: 'divider' },
                      //   { id: 'rename', name: 'Rename', icon: 'edit' },
                      //   { id: 'delete', name: 'Move to trash', icon: 'delete' }
                      // ],
                      // onSelectMenu: (path) => {
                      //   switch (path.first()) {
                      //     case 'copy_file': {
                      //       let blob = new Blob([documentItem.snapshot.source!.contents], { type: 'plain/text' });

                      //       this.pool.add(async () => {
                      //         await navigator.clipboard.write([
                      //           new ClipboardItem({
                      //             [blob.type]: blob
                      //           })
                      //         ]);
                      //       });
                      //     }
                      //   }
                      // }
                    };
                  })} />
                  <DocumentEditor
                    autoSave={false}
                    documentItem={this.state.documentItems.find((documentItem) => documentItem.slotSnapshot.id === this.state.selectedDocumentId)!}
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
              <div>Last saved: {this.selectedDocumentItem.slotSnapshot.document?.lastModificationDate ? new Date(this.selectedDocumentItem.slotSnapshot.document.lastModificationDate).toLocaleTimeString() : '–'}</div>
            </div>
          </div>
        </div>
      </main>
    );
  }


  static navigate(draftId: DraftInstanceId) {
    return navigation.navigate(`${BaseUrl}/draft/${draftId}`);
  }
}


export interface ViewDraftWrapperRoute {
  id: '_';
  params: {
    draftId: DraftInstanceId;
  };
}

export type ViewDraftWrapperProps = ViewProps<ViewDraftWrapperRoute>;

export class ViewDraftWrapper extends Component<ViewDraftWrapperProps, {}> {
  get draftInstanceSnapshot() {
    return this.props.app.state.drafts[this.props.route.params.draftId];
  }

  override componentDidMount() {
    if (!this.draftInstanceSnapshot) {
      ViewDrafts.navigate();
    }
  }

  override render() {
    if (!this.draftInstanceSnapshot) {
      return null;
    }

    return (
      <ViewDraft
        app={this.props.app}
        draft={this.draftInstanceSnapshot}
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
