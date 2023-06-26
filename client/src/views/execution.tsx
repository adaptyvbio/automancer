import { List } from 'immutable';
import hash from 'object-hash';
import { Experiment, OrdinaryId, ProtocolBlockPath } from 'pr1-shared';
import { Component, createRef } from 'react';
import seqOrd from 'seq-ord';

import viewStyles from '../../styles/components/view.module.scss';

import { BlockInspector } from '../components/block-inspector';
import { Button } from '../components/button';
import { ErrorBoundary } from '../components/error-boundary';
import { ExecutionInspector } from '../components/execution-inspector';
import { GraphEditor } from '../components/graph-editor';
import { EditProtocolModal } from '../components/modals/edit-protocol';
import { ReportPanel } from '../components/report-panel';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TitleBar } from '../components/title-bar';
import { GlobalContext } from '../interfaces/plugin';
import { ViewProps } from '../interfaces/view';
import { createPluginContext } from '../plugin';
import { analyzeBlockPath, createBlockContext, getBlockImpl, getCommonBlockPathLength, getRefPaths } from '../protocol';
import { ShortcutCode } from '../shortcuts';
import * as util from '../util';
import { Pool } from '../util';
import { ViewDraft } from './draft';
import { ViewExperimentWrapperRoute } from './experiment-wrapper';


export type ViewExecutionProps = ViewProps<ViewExperimentWrapperRoute> & { experiment: Experiment; };

export interface ViewExecutionState {
  editModalOpen: boolean;
  selection: {
    blockPath: ProtocolBlockPath;
    observed: boolean;
  } | null;
  toolsTabId: OrdinaryId | null;
  toolsOpen: boolean;
}

export class ViewExecution extends Component<ViewExecutionProps, ViewExecutionState> {
  private controller = new AbortController();
  private pool = new Pool();
  private refTitleBar = createRef<TitleBar>();

  constructor(props: ViewExecutionProps) {
    super(props);

    this.state = {
      editModalOpen: false,
      selection: null,
      toolsTabId: 'inspector',
      toolsOpen: true
    };
  }

  get master() {
    return this.props.experiment.master!;
  }

  private get activeBlockPaths() {
    return getRefPaths(this.master.protocol.root, this.master.location, this.globalContext);
  }

  private get globalContext(): GlobalContext {
    return {
      app: this.props.app,
      host: this.props.host,
      pool: this.pool
    };
  }

  selectBlock(blockPath: ProtocolBlockPath | null, options?: { showInspector?: unknown; }) {
    this.setState({
      selection: blockPath && {
        blockPath,
        observed: false
      }
    });

    if (options?.showInspector) {
      this.setState({
        toolsOpen: true
      });
    }
  }

  override componentDidMount() {
    let panels: {
      id: OrdinaryId;
      shortcut: ShortcutCode;
    }[] = [
      { id: 'inspector', shortcut: 'E' },
      { id: 'report', shortcut: 'R' },
      ...Object.values(this.props.host.plugins)
        .flatMap((plugin) =>
          (plugin.executionPanels ?? [])
            .filter((executionPanel) => executionPanel.shortcut)
            .map((executionPanel) => ({
              id: hash([plugin.namespace, executionPanel.id]),
              shortcut: executionPanel.shortcut!
            }))
        )
    ];

    for (let { id, shortcut } of panels) {
      this.props.app.shortcutManager.attach(shortcut, () => {
        this.setState({
          toolsOpen: true,
          toolsTabId: id
        });
      }, { signal: this.controller.signal });
    }
  }

  override componentWillUnmount() {
    this.controller.abort();
  }

  override render() {
    let activeBlockPaths = this.activeBlockPaths;
    let selectedBlockPath = (this.state.selection?.blockPath ?? null);
    let isSelectedBlockActive = selectedBlockPath && activeBlockPaths.some((path) => util.deepEqual(path, selectedBlockPath));

    return (
      <main className={viewStyles.root}>
        <TitleBar
          title={this.props.experiment.title}
          subtitle={`Running ‘${this.master.protocol.name!}’`}
          subtitleVisible={true}
          tools={[{
            id: 'inspector',
            active: this.state.toolsOpen,
            icon: 'view_week',
            onClick: () => {
              this.setState({ toolsOpen: !this.state.toolsOpen });
            }
          }]}
          ref={this.refTitleBar} />
        <div className={viewStyles.contents}>
          <SplitPanels
            panels={[
              {
                component: (
                  <ErrorBoundary>
                    <GraphEditor
                      app={this.props.app}
                      host={this.props.host}
                      location={this.master.location}
                      protocolRoot={this.master.protocol.root}
                      selectBlock={this.selectBlock.bind(this)}
                      selection={this.state.selection}
                      onEditDraft={() => {
                        this.setState({ editModalOpen: true });
                      }} />
                  </ErrorBoundary>
                )
              },
              {
                nominalSize: CSSNumericValue.parse('400px'),
                onToggle: (open) => void this.setState({ toolsOpen: open }),
                open: this.state.toolsOpen,
                component: (
                  <TabNav
                    activeEntryId={this.state.toolsTabId}
                    setActiveEntryId={(id) => void this.setState({ toolsTabId: id })}
                    entries={[
                      ...(isSelectedBlockActive
                        ? [{
                          id: ('inspector' as const),
                          label: 'Execution',
                          shortcut: ('E' as const),
                          contents: () => (
                            <ErrorBoundary>
                              <ExecutionInspector
                                activeBlockPaths={activeBlockPaths}
                                app={this.props.app}
                                blockPath={selectedBlockPath}
                                experiment={this.props.experiment}
                                host={this.props.host}
                                location={this.master.location}
                                protocol={this.master.protocol}
                                selectBlock={this.selectBlock.bind(this)} />
                            </ErrorBoundary>
                          )
                        }]
                        : [{
                          id: ('inspector' as const),
                          label: 'Inspector',
                          shortcut: ('E' as const),
                          contents: () => (
                            <BlockInspector
                              app={this.props.app}
                              blockPath={selectedBlockPath}
                              location={this.master.location}
                              mark={null}
                              footer={selectedBlockPath && !isSelectedBlockActive
                                ? [(
                                  <>
                                    <Button shortcut="J" onClick={() => {
                                      let targetBlockPath = selectedBlockPath!;
                                      let commonBlockPath = List(activeBlockPaths)
                                        .map((blockPath): ProtocolBlockPath => blockPath.slice(0, getCommonBlockPathLength(blockPath, targetBlockPath)))
                                        .maxBy((commonBlockPath) => commonBlockPath.length)!;

                                      let blockAnalysis = analyzeBlockPath(this.master.protocol, this.master.location, null, targetBlockPath, this.globalContext);
                                      let currentPoint: unknown | null = null;

                                      for (let blockIndex = (targetBlockPath.length - 1); blockIndex >= commonBlockPath.length; blockIndex -= 1) {
                                        let currentPair = blockAnalysis.pairs[blockIndex];
                                        let currentBlockImpl = getBlockImpl(currentPair.block, this.globalContext);

                                        if (currentBlockImpl.createPoint) {
                                          currentPoint = currentBlockImpl.createPoint(currentPair.block, currentPair.location, {
                                            key: targetBlockPath[blockIndex],
                                            point: currentPoint
                                          }, this.globalContext);
                                        }
                                      }

                                      let commonBlockContext = createBlockContext(commonBlockPath, this.props.experiment, this.globalContext);

                                      this.pool.add(async () => {
                                        await commonBlockContext.sendMessage({
                                          type: 'jump',
                                          value: currentPoint
                                        });

                                        this.setState({
                                          selection: null
                                        });
                                      });
                                    }}>Jump here</Button>
                                  </>
                                ), null]
                                : null}
                              host={this.props.host}
                              protocol={this.master.protocol}
                              selectBlock={this.selectBlock.bind(this)} />
                          )
                        }]),
                      {
                        id: 'report',
                        label: 'Report',
                        shortcut: ('R' as const),
                        contents: () => (
                          <ReportPanel
                            compilationAnalysis={this.master.initialAnalysis}
                            masterAnalysis={this.master.masterAnalysis} />
                        )
                      },
                      ...Object.values(this.props.host.plugins)
                        .flatMap((plugin) =>
                          (plugin.executionPanels ?? []).map((executionPanel) => ({
                            namespace: plugin.namespace,
                            panel: executionPanel,
                          }))
                        )
                        .sort(seqOrd(function* (a, b, rules) {
                          yield rules.text(a.panel.label, b.panel.label);
                        }))
                        .map(({ namespace, panel }) => ({
                          id: hash([namespace, panel.id]),
                          label: panel.label,
                          shortcut: (panel.shortcut ?? null),
                          contents: () => (
                            <ErrorBoundary>
                              <panel.Component
                                context={createPluginContext(this.props.app, this.props.host, namespace)}
                                experiment={this.props.experiment} />
                            </ErrorBoundary>
                          )
                        }))
                    ]} />
                )
              }
            ]} />
        </div>

        {this.state.editModalOpen && (
          <EditProtocolModal
            originalAvailable={this.master.protocol.draft.id in this.props.app.state.drafts}
            onCancel={() => {
              this.setState({ editModalOpen: false });
            }}
            onSubmit={(mode) => {
              if (mode === 'original') {
                ViewDraft.navigate(this.master.protocol.draft.id, {
                  experimentId: this.props.experiment.id
                });
              }
            }} />
        )}
      </main>
    );
  }


  static getDerivedStateFromProps(props: ViewExecutionProps, state: ViewExecutionState): Partial<ViewExecutionState> | null {
    let experiment = props.host.state.experiments[props.route.params.experimentId];

    if (!experiment?.master) {
      return null;
    }

    let globalContext: GlobalContext = {
      app: props.app,
      host: props.host,
      pool: new Pool()
    };

    let activeBlockPaths = List(getRefPaths(experiment.master.protocol.root, experiment.master.location, globalContext).map((blockPath) => List(blockPath)));
    let selectedBlockPath = state.selection && List(state.selection.blockPath);

    // The previously-selected block has been unselected.
    if (!selectedBlockPath) {
      return {
        selection: {
          blockPath: activeBlockPaths.first()!.toArray(),
          observed: true
        },
        toolsTabId: 'inspector'
      };
    }

    // The observed (= not explicit selected) selection is not active anymore.
    if (state.selection!.observed && !activeBlockPaths.includes(selectedBlockPath)) {
      return {
        selection: {
          blockPath: activeBlockPaths.maxBy((blockPath) => getCommonBlockPathLength(
            blockPath.toArray(),
            selectedBlockPath!.toArray()
          ))!.toArray(),
          observed: true
        }
      };
    }

    return null;
  }
}
