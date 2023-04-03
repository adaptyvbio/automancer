import { Chip, ChipId, UnitNamespace } from 'pr1-shared';
import * as React from 'react';
import Split from 'react-split-grid';

import editorStyles from '../../styles/components/editor.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';
import formStyles from '../../styles/components/form.module.scss';
import viewStyles from '../../styles/components/view.module.scss';

import type { Application } from '../application';
import { Icon } from '../components/icon';
import { TextEditor } from '../components/text-editor';
import { VisualEditor } from '../components/visual-editor';
import { Draft, DraftCompilation, DraftId, DraftPrimitive } from '../draft';
import { Host } from '../host';
import { Pool } from '../util';
import { BarNav } from '../components/bar-nav';
import { SplitPanels } from '../components/split-panels';
import { TitleBar } from '../components/title-bar';
import { Button } from '../components/button';
import * as util from '../util';
import { DraftSummary } from '../components/draft-summary';
import { GraphEditor } from '../components/graph-editor';
import { TabNav } from '../components/tab-nav';
import { BlockInspector } from '../components/block-inspector';
import * as format from '../format';
import { ProtocolBlockPath } from '../interfaces/protocol';
import { StartProtocolModal } from '../components/modals/start-protocol';
import { BaseUrl } from '../constants';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { ViewDrafts } from './protocols';
import { ViewExecution } from './execution';
import { DiagnosticsReport } from '../components/diagnostics-report';
import { FileTabNav } from '../components/file-tab-nav';
import { TimeSensitive } from '../components/time-sensitive';


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

export class ViewDraft extends React.Component<ViewDraftProps, ViewDraftState> {
  chipIdAwaitingRedirection: ChipId | null = null;
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
      selectedBlockPath: null,
      startModalOpen: false,

      draggedTrack: null,
      graphOpen: true,
      inspectorEntryId: 'inspector',
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

    document.body.addEventListener('keydown', (event) => {
      if ((event.key === 's') && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();

        if (!this.state.compiling && this.state.compilation?.valid) {
          this.setState({ startModalOpen: true });
        }
      }
    }, { signal: this.controller.signal });
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

    if (this.chipIdAwaitingRedirection) {
      let chip = this.props.host.state.chips[this.chipIdAwaitingRedirection] as Chip;

      if (chip.master) {
        ViewExecution.navigate(chip.id);
      }
    }
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

      // TODO: Improve
      if (this.state.selectedBlockPath) {
        let block = compilation.protocol?.root;

        for (let key of this.state.selectedBlockPath) {
          if (!block) {
            this.setState({ selectedBlockPath: null });
            break;
          }

          let unit = this.props.host.units[block.namespace];
          block = unit.getChildBlock?.(block, key);
        }

        if (!block) {
          this.setState({ selectedBlockPath: null });
        }
      }

      // if (options.global) {
      //   await this.props.app.saveDraftCompilation(this.props.draft, compilation);
      // }
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


  render() {
    let component: React.ReactNode;
    let subtitle: React.ReactNode | null = null;
    let subtitleVisible = false;

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
          onStart={() => {
            this.setState({ startModalOpen: true });
          }} />
      );

      component = (
        <div className={util.formatClass(viewStyles.contents, editorStyles.root)}>
          {this.state.startModalOpen && (
            <StartProtocolModal
              host={this.props.host}
              onCancel={() => void this.setState({ startModalOpen: false })}
              onSubmit={(data) => {
                this.pool.add(async () => {
                  let client = this.props.host.client;
                  let chipId = data.chipId ?? (await client.request({ type: 'createChip' })).chipId;

                  if (data.newChipTitle) {
                    await client.request({
                      type: 'command',
                      chipId,
                      namespace: ('metadata' as UnitNamespace),
                      command: {
                        type: 'set',
                        archived: false,
                        description: '',
                        title: data.newChipTitle
                      }
                    });
                  }

                  this.chipIdAwaitingRedirection = chipId;

                  try {
                    await client.request({
                      type: 'startDraft',
                      chipId,
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
                    this.chipIdAwaitingRedirection = null;
                    throw err;
                  }

                  console.clear();
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
                  <GraphEditor
                    host={this.props.host}
                    selectBlock={this.selectBlock.bind(this)}
                    selectedBlockPath={this.state.selectedBlockPath}
                    summary={summary}
                    tree={this.state.compilation?.protocol?.root ?? null} />
                ) },
              { nominalSize: CSSNumericValue.parse('400px'),
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
                          contents: () => (
                            this.state.compilation?.protocol
                              ? (
                                <BlockInspector
                                  blockPath={this.state.selectedBlockPath}
                                  host={this.props.host}
                                  protocol={this.state.compilation!.protocol}
                                  selectBlock={this.selectBlock.bind(this)} />
                              )
                              : <div />
                          ) },
                        { id: 'report',
                          label: 'Report',
                          contents: () => (
                            <DiagnosticsReport diagnostics={this.state.compilation?.analysis.diagnostics ?? []} />
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
          <TimeSensitive child={() => {
            let delta = (Date.now() - lastModified);

            return (delta < 5e3)
              ? 'Just saved'
              : `Last saved ${format.formatRelativeDate(lastModified)}`;
            }
          } interval={1e3} />
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

export class ViewDraftWrapper extends React.Component<ViewDraftWrapperProps, {}> {
  get draft() {
    return this.props.app.state.drafts[this.props.route.params.draftId];
  }

  componentDidMount() {
    if (!this.draft) {
      ViewDrafts.navigate();
    }
  }

  render() {
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
  onStart(): void;
}) {
  if (props.compiling) {
    return <DraftSummary status="default" title="Compiling" />;
  }

  let compilation = props.compilation!;

  let [errorCount, warningCount] = compilation.analysis.diagnostics.reduce(([errorCount, warningCount], diagnostic) => {
    switch (diagnostic.kind) {
      case 'error': return [errorCount + 1, warningCount];
      case 'warning': return [errorCount, warningCount + 1];
    }
  }, [0, 0]);

  let onStart = compilation.valid
    ? props.onStart
    : null;

  let warningText = warningCount > 0
    ? `${warningCount} warning${warningCount > 1 ? 's' : ''}`
    : null;

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
        onStart={onStart}
        status="warning"
        title={warningText} />
    );
  } else {
    return (
      <DraftSummary
        onStart={onStart}
        status="success"
        title="Ready" />
    );
  }
}
