import * as monaco from 'monaco-editor';
import { AnyDurationTerm, Deferred, Experiment, ExperimentId, ProtocolBlockPath, defer } from 'pr1-shared';
import { Component, Fragment, ReactNode, createRef } from 'react';

import editorStyles from '../../styles/components/editor.module.scss';
import viewStyles from '../../styles/components/view.module.scss';

import { OrderedMap } from 'immutable';
import { DocumentId, DocumentSlotSnapshot, DraftInstanceId, DraftInstanceSnapshot } from '../app-backends/base';
import { BlockInspector } from '../components/block-inspector';
import { DocumentEditor } from '../components/document-editor';
import { DraftSummary } from '../components/draft-summary';
import { ErrorBoundary } from '../components/error-boundary';
import { FileTabNav } from '../components/file-tab-nav';
import { GraphEditor } from '../components/graph-editor';
import { StartProtocolModal } from '../components/modals/start-protocol';
import { UnsavedDocumentModal } from '../components/modals/unsaved-document';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TextEditor } from '../components/text-editor';
import { TimeSensitive } from '../components/time-sensitive';
import { TitleBar } from '../components/title-bar';
import { BaseUrl } from '../constants';
import { DraftCompilation } from '../draft';
import { formatDigitalDate, formatDurationTerm, formatTimeDifference } from '../format';
import { HostDraftCompilerResult } from '../interfaces/draft';
import { GlobalContext } from '../interfaces/plugin';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { analyzeBlockPath } from '../protocol';
import { Pool, formatClass } from '../util';
import { ViewExperimentWrapper } from './experiment-wrapper';
import { ViewDrafts } from './protocols';
import { InfoBar } from '../components/info-bar';
import { ViewExperiment } from './experiment';
import { ReportPanel } from '../components/report-panel';
import { PanelPlaceholder } from '../libraries/panel';


export interface DocumentItem {
  controller: AbortController; // TODO: Move to meta
  slotSnapshot: DocumentSlotSnapshot;
  textModel: monaco.editor.ITextModel | null;
  unsaved: boolean;
  writing: boolean;

  meta: {
    currentVersionId: number | null;
    updated: boolean; // = Updated since the last start of a compilation.
  };
}


export type ViewDraftProps = Omit<ViewProps, 'route'> & {
  draft: DraftInstanceSnapshot;
  experiment: Experiment | null;
}

export interface ViewDraftState {
  self: ViewDraft;

  compilation: HostDraftCompilerResult | null;
  compiling: boolean;
  cursorPosition: monaco.Position | null;
  documentItems: OrderedMap<DocumentId, DocumentItem>;
  graphOpen: boolean;
  inspectorEntryId: string | null;
  inspectorOpen: boolean;
  selectedBlockPath: ProtocolBlockPath | null;
  selectedDocumentId: DocumentId;
  startModalOpen: boolean;
  unsavedDocumentDeferred: Deferred<boolean> | null;
}

export class ViewDraft extends Component<ViewDraftProps, ViewDraftState> {
  private experimentIdAwaitingRedirection: ExperimentId | null = null;
  private compilationController: AbortController | null = null;
  private compilationPromise: Promise<HostDraftCompilerResult> | null = null;
  private controller = new AbortController();
  private pool = new Pool();
  private refTextEditor = createRef<TextEditor>();
  private refTitleBar = createRef<TitleBar>();

  constructor(props: ViewDraftProps) {
    super(props);

    let entrySlot = this.props.draft.model.getEntryDocumentSlot();

    let entryDocumentItem: DocumentItem = {
      controller: new AbortController(),
      slotSnapshot: entrySlot.getSnapshot(),
      textModel: null,
      unsaved: false,
      writing: false,

      meta: {
        currentVersionId: null,
        updated: true
      }
    };

    let getModelOfDocumentItem = (documentItem: DocumentItem, snapshot: DocumentSlotSnapshot = documentItem.slotSnapshot) => {
      // If the document has received an external modification
      // Then update the text model
      if (documentItem.textModel && snapshot.instance && (snapshot.instance.lastExternalModificationDate === snapshot.instance.lastModificationDate)) {
        documentItem.meta.currentVersionId = documentItem.textModel.getVersionId() + 1;
        documentItem.meta.updated = true;

        let textEditor = this.refTextEditor.current!.editor;
        let position = textEditor.getPosition();

        documentItem.textModel.setValue(snapshot.instance.contents);

        if (position) {
          textEditor.setPosition(position);
        }

        this.setDocumentItem(snapshot.id, {
          unsaved: false
        });

        this.pool.add(this.saveDraftName(documentItem));
      }

      // If the document exists but the text model doesn't
      if (!documentItem.textModel && snapshot.instance) {
        let model = monaco.editor.createModel(snapshot.instance.contents, 'prl');

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

      // If the text model already exists but the document was removed
      // And there are no unsaved changes
      if (documentItem.textModel && !snapshot.instance && !documentItem.unsaved) {
        documentItem.textModel.dispose();
        documentItem.textModel = null;
      }

      return documentItem.textModel;
    };

    let documentItems = OrderedMap([[entrySlot.id, entryDocumentItem]]).map((documentItem) => ({
      ...documentItem,
      textModel: getModelOfDocumentItem(documentItem)
    } satisfies DocumentItem));

    this.state = {
      self: this,

      compilation: null,
      compiling: true, // The draft will soon be compiling if it's readable.
      cursorPosition: null,
      documentItems,
      graphOpen: true,
      inspectorEntryId: 'inspector',
      inspectorOpen: true,
      selectedBlockPath: null,
      selectedDocumentId: entrySlot.id,
      startModalOpen: false,
      unsavedDocumentDeferred: null
    };

    entrySlot.watchSnapshot((snapshot) => {
      // console.log('Update >>', snapshot);

      let documentItem = this.state.documentItems.get(snapshot.id)!;
      let textModel = getModelOfDocumentItem(documentItem, snapshot);

      // console.log('ℹ️ Snapshot', snapshot.lastModificationDate, snapshot.lastExternalModificationDate);

      this.setDocumentItem(snapshot.id, {
        slotSnapshot: snapshot,
        textModel
      });
    }, { signal: entryDocumentItem.controller.signal });

    entrySlot.watch({ signal: entryDocumentItem.controller.signal });
  }

  get selectedDocumentItem() {
    return this.state.documentItems.find((item) => item.slotSnapshot.id === this.state.selectedDocumentId)!;
  }

  private async saveDocuments(singleDocumentItem: DocumentItem | null = null) {
    for (let documentItem of singleDocumentItem ? [singleDocumentItem] : this.state.documentItems.values()) {
      if (documentItem.textModel && documentItem.slotSnapshot.instance?.writable) {
        let slot = documentItem.slotSnapshot.model;
        let contents = documentItem.textModel.getValue();

        this.setDocumentItem(documentItem.slotSnapshot.id, {
          writing: true
        });

        try {
          await this.saveDraftName(documentItem);
          await slot.write(contents);
        } finally {
          this.setDocumentItem(documentItem.slotSnapshot.id, {
            writing: false
          });
        }

        this.setDocumentItem(documentItem.slotSnapshot.id, {
          unsaved: false
        });
      }
    }
  }

  private async saveDraftName(documentItem: DocumentItem) {
    if (true /* is entry item */) {
      let compilation = await this.getCompilation();
      let name = compilation.protocol?.name ?? null;

      if ((name !== null) && (name !== this.props.draft.name)) {
        await this.props.draft.model.setName(name);
      }
    }
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
      this.pool.add(async () => {
        this.saveDocuments(this.selectedDocumentItem);
      });
    }, { signal: this.controller.signal });

    this.props.setUnsavedDataCallback(async () => {
      for (let documentItem of this.state.documentItems.values()) {
        if (documentItem.unsaved) {
          let deferred = defer<boolean>();
          this.setState({ unsavedDocumentDeferred: deferred });

          return await deferred.promise;
        }
      }

      return true;
    });
  }

  override componentDidUpdate(prevProps: ViewDraftProps, prevState: ViewDraftState) {
    let selectedDocumentItem = this.selectedDocumentItem;
    let prevSelectedDocumentItem = prevState.documentItems.find((item) => item.slotSnapshot.id === selectedDocumentItem.slotSnapshot.id);

    if (prevSelectedDocumentItem) {
      let prevModificationDate = prevSelectedDocumentItem.slotSnapshot.instance?.lastModificationDate ?? null;
      let modificationDate = selectedDocumentItem.slotSnapshot.instance?.lastModificationDate ?? null;

      if ((prevModificationDate !== null) && (modificationDate !== null) && (modificationDate !== prevModificationDate)) {
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
      documentItem.textModel = null;
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


    let result: HostDraftCompilerResult;

    while (true) {
      result = await this.props.host.client.request({
        type: 'compileDraft',
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
        },
        studyExperimentId: (this.props.experiment?.id ?? null)
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

      break;

      // if (documentItems !== this.state.documentItems) {
      //   this.setState({ documentItems });
      // } else {
      //   break;
      // }
    }

    if (!compilationController.signal.aborted) {
      this.compilationController = null;

      this.setState({
        compilation: result,
        compiling: false
      });
    }

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
    let selectedDocumentSnapshot = this.selectedDocumentItem.slotSnapshot;

    let subtitle = null;
    let subtitleVisible = false;

    let globalContext: GlobalContext = {
      app: this.props.app,
      host: this.props.host,
      pool: this.pool
    };

    if (!selectedDocumentSnapshot.instance) {
      subtitle = {
        'error': 'Unknown error',
        'loading': null,
        'ok': null,
        'missing': 'Missing file',
        'prompt': 'Permission required',
        'unreadable': 'Permission required',
        'unwatched': null
      }[selectedDocumentSnapshot.status];
      subtitleVisible = (subtitle !== null);
    } else if (selectedDocumentSnapshot.instance.lastModificationDate !== null) {
      let modificationDate = selectedDocumentSnapshot.instance.lastModificationDate;

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
        editMode={this.props.experiment}
        onTrigger={() => {
          if (this.props.experiment) {

          } else {
            this.setState({ startModalOpen: true });
          }
        }} />
    );

    return (
      <main className={viewStyles.root}>
        <TitleBar
          // title={this.state.compilation?.protocol?.name ?? this.props.draft.name ?? '[Untitled]'}
          title={[
            this.props.draft.name ?? '[Untitled]',
            this.props.experiment && <Fragment key={0}> &mdash; Editing running protocol</Fragment>
          ]}
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
        <InfoBar
          className={viewStyles.contents}
          mode={this.props.experiment ? 'edit' : 'default'}
          left={(() => {
            let writingCount = this.state.documentItems.valueSeq().reduce((count, documentItem) => count + (documentItem.writing ? 1 : 0), 0);

            if (writingCount > 1) {
              return <>Writing {writingCount} files&hellip;</>
            } else if (writingCount > 0) {
              return <>Writing file&hellip;</>
            }

            if (this.state.cursorPosition) {
              return (
                <span>Ln {this.state.cursorPosition.lineNumber}, Col {this.state.cursorPosition.column}</span>
              );
            }

            return null;
          })()}
          right={(() => (
            <>
              {this.props.experiment && (
                <>
                  <button type="button" onClick={() => {
                    ViewExperimentWrapper.navigate(this.props.experiment!.id);
                  }}>Abort edit</button>
                  <button type="button" onClick={() => {
                    ViewDraft.navigate(this.props.draft.id);
                  }}>Detach</button>
                </>
              )}
              {/* <div>Status: {this.selectedDocumentItem.slotSnapshot.status}</div> */}
              <div>Last saved: {this.selectedDocumentItem.slotSnapshot.instance?.lastModificationDate ? new Date(this.selectedDocumentItem.slotSnapshot.instance.lastModificationDate).toLocaleTimeString() : '–'}</div>
            </>
          ))()}>
          <SplitPanels
            panels={[
              { component: (
                <div className={editorStyles.editorPanel}>
                  <FileTabNav entries={this.state.documentItems.valueSeq().toArray().map((documentItem, index) => {
                    return {
                      id: documentItem.slotSnapshot.id,
                      label: documentItem.slotSnapshot.path.at(-1)!,
                      missing: (documentItem.slotSnapshot.status === 'missing'),
                      unsaved: documentItem.unsaved,
                      selected: (documentItem.slotSnapshot.id === this.state.selectedDocumentId),
                      onClose() {
                        ViewDrafts.navigate();
                      },
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
                    }}
                    refTextEditor={this.refTextEditor} />
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
                                    location={this.props.experiment?.master!.location ?? null}
                                    mark={this.state.compilation!.study?.mark ?? null}
                                    protocol={this.state.compilation!.protocol}
                                    selectBlock={this.selectBlock.bind(this)} />
                                </ErrorBoundary>
                              )
                              : (
                                <PanelPlaceholder message="Nothing selected" />
                              )
                          ) },
                        { id: 'report',
                          label: 'Report',
                          shortcut: 'R',
                          contents: () => (
                            <ReportPanel
                              compilationAnalysis={this.state.compilation?.analysis ?? null} />
                          ) }
                      ]} />
                  </div>
                ) }
            ]} />
        </InfoBar>
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
        {this.state.unsavedDocumentDeferred && (
          <UnsavedDocumentModal
            onFinish={(result) => {
              let deferred = this.state.unsavedDocumentDeferred!;
              this.setState({ unsavedDocumentDeferred: null });

              if (result === 'save') {
                this.pool.add(async () => {
                  await this.saveDocuments();
                  deferred.resolve(true);
                });
              } else {
                deferred.resolve(result === 'ignore');
              }
            }} />
        )}
      </main>
    );
  }


  static getDerivedStateFromProps(props: ViewDraftProps, state: ViewDraftState): Partial<ViewDraftState> | null {
    if (state.compilation?.protocol && state.selectedBlockPath) {
      let analysis: ReturnType<typeof analyzeBlockPath> | null;

      try {
        analysis = analyzeBlockPath(
          state.compilation?.protocol,
          null,
          null,
          state.selectedBlockPath,
          {
            app: props.app,
            host: props.host,
            pool: state.self.pool
          }
        );
      } catch (err: any) {
        if (err.code === 'INVALID_BLOCK_PATH') {
          analysis = null;
        } else {
          throw err;
        }
      }

      if (!analysis || !analysis.isLeafBlockTerminal) {
        return {
          selectedBlockPath: null
        };
      }
    }

    return null;
  }


  static navigate(draftId: DraftInstanceId, options?: {
    experimentId?: ExperimentId;
  }) {
    return navigation.navigate(`${BaseUrl}/draft/${draftId}`, {
      state: {
        experimentId: (options?.experimentId ?? null)
      } satisfies ViewDraftWrapperRoute['state']
    });
  }
}


export interface ViewDraftWrapperRoute {
  id: '_';
  params: {
    draftId: DraftInstanceId;
  };
  state: {
    experimentId: ExperimentId | null;
  } | undefined;
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

    let experimentId = this.props.route.state?.experimentId ?? null;
    let experiment = experimentId && this.props.host.state.experiments[experimentId];

    return (
      <ViewDraft
        {...this.props}
        draft={this.draftInstanceSnapshot}
        experiment={experiment} />
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
  compilation: HostDraftCompilerResult | null;
  compiling: boolean;
  context: GlobalContext;
  editMode: unknown;
  onTrigger(): void;
}) {
  if (props.compiling) {
    return <DraftSummary status="default" title="Compiling" />;
  }

  let compilation = props.compilation!;
  let errorCount = compilation.analysis.errors.length;
  let warningCount = compilation.analysis.warnings.length;

  let onTrigger = compilation.valid
    ? props.onTrigger
    : null;

  let warningText = (warningCount > 0)
    ? `${warningCount} warning${warningCount > 1 ? 's' : ''}`
    : null;


  let etaText: ReactNode | null = null;

  if (compilation.protocol) {
    let analysis = analyzeBlockPath(compilation.protocol, null, (compilation.study?.mark ?? null), [], props.context);
    let pair = analysis.pairs[0];
    let terms = pair.terms!;

    let formattedDuration = formatDurationTerm(terms.end as AnyDurationTerm);

    if (formattedDuration !== null) {
      etaText = [formattedDuration];

      if (terms.end.type === 'duration') {
        let endTerm = terms.end;

        etaText = [
          formattedDuration,
          ' (ETA ',
          <TimeSensitive
            contents={() => {
              let now = Date.now();
              return formatDigitalDate(now + endTerm.value, now, { format: 'react' })
            }}
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

  let message = props.editMode ? 'Update' : 'Start';

  if (errorCount > 0) {
    return (
      <DraftSummary
        description={warningText}
        message={message}
        onTrigger={onTrigger}
        status="error"
        title={`${errorCount} error${errorCount > 1 ? 's' : ''}`} />
    );
  } else if (warningText) {
    return (
      <DraftSummary
        description={etaText}
        message={message}
        onTrigger={onTrigger}
        status="warning"
        title={warningText} />
    );
  } else {
    return (
      <DraftSummary
        description={etaText}
        message={message}
        onTrigger={onTrigger}
        status="success"
        title="Ready" />
    );
  }
}
