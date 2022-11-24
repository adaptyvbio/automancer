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

import editorStyles from '../../styles/components/editor.module.scss';
import diagnosticsStyles from '../../styles/components/diagnostics.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';
import formStyles from '../../styles/components/form.module.scss';
import viewStyles from '../../styles/components/view.module.scss';


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
  selectedBlockPath: ProtocolBlockPath | null;

  draggedTrack: number | null;
  graphOpen: boolean;
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
      selectedBlockPath: [0, null], // TODO: Change

      draggedTrack: null,
      graphOpen: true,
      inspectorOpen: true // TODO: Change
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

  selectBlock(path: ProtocolBlockPath | null) {
    this.setState({ selectedBlockPath: path });
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
      let summary = (
        <FilledDraftSummary
          compiling={this.state.compiling}
          compilation={this.state.compilation} />
      );

      component = (
        <div className={util.formatClass(viewStyles.contents, editorStyles.root)}>
          <SplitPanels
            className={editorStyles.panels}
            panels={[
              { component: (
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
                    <TabNav entries={[
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
              this.setState({ inspectorOpen: !this.state.inspectorOpen });
            }
          }]}
          ref={this.refTitleBar} />
        {component}
      </main>
    );
  }
}


export function FilledDraftSummary(props: {
  compilation: DraftCompilation | null;
  compiling: boolean;
}) {
  if (props.compiling) {
    return <DraftSummary status="default" title="Compiling" />;
  }

  let compilation = props.compilation!;

  let [errorCount, warningCount] = compilation.diagnostics.reduce(([errorCount, warningCount], diagnostic) => {
    switch (diagnostic.kind) {
      case 'error': return [errorCount + 1, warningCount];
      case 'warning': return [errorCount, warningCount + 1];
    }
  }, [0, 0]);

  let onStart = compilation.valid
    ? () => { }
    : undefined;

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
