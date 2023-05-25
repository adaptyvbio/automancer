import { List } from 'immutable';
import { ExperimentId, PluginName, ProtocolBlockPath } from 'pr1-shared';
import { Component, createRef } from 'react';

import viewStyles from '../../styles/components/view.module.scss';

import { BlockInspector } from '../components/block-inspector';
import { ExecutionInspector } from '../components/execution-inspector';
import { GraphEditor } from '../components/graph-editor';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TitleBar } from '../components/title-bar';
import { Pool } from '../util';
import * as util from '../util';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { BaseUrl } from '../constants';
import { ViewExperiments } from './experiments';
import { ViewChip } from './chip';
import { ExecutionDiagnosticsReport } from '../components/execution-diagnostics-report';
import { analyzeBlockPath, createBlockContext, getBlockImpl, getCommonBlockPathLength, getRefPaths } from '../protocol';
import { GlobalContext } from '../interfaces/plugin';
import { ErrorBoundary } from '../components/error-boundary';
import { Button } from '../components/button';


export interface ViewExecutionRoute {
  id: '_';
  params: {
    experimentId: ExperimentId;
  };
}

export type ViewExecutionProps = ViewProps<ViewExecutionRoute>;

export interface ViewExecutionState {
  selection: {
    blockPath: ProtocolBlockPath;
    observed: boolean;
  } | null;
  toolsTabId: string | null;
  toolsOpen: boolean;
}

export class ViewExecution extends Component<ViewExecutionProps, ViewExecutionState> {
  private pool = new Pool();
  private refTitleBar = createRef<TitleBar>();

  constructor(props: ViewExecutionProps) {
    super(props);

    this.state = {
      selection: null,
      toolsTabId: 'execution',
      toolsOpen: true
    };
  }

  get experiment() {
    return this.props.host.state.experiments[this.props.route.params.experimentId];
  }

  get master() {
    return this.experiment.master!;
  }

  componentDidRender() {
    if (!this.experiment) {
      ViewExperiments.navigate();
    } else if (!this.experiment.master) {
      if (navigation.canGoBack) {
        navigation.back();
      } else {
        ViewChip.navigate(this.experiment.id);
      }
    }
  }

  override componentDidMount() {
    this.componentDidRender();
  }

  override componentDidUpdate() {
    this.componentDidRender();
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
      },
      toolsTabId: 'execution'
    });

    if (options?.showInspector) {
      this.setState({
        toolsTabId: 'execution',
        toolsOpen: true
      });
    }
  }

  override render() {
    if (!this.experiment?.master) {
      return null;
    }

    let activeBlockPaths = this.activeBlockPaths;
    let selectedBlockPath = (this.state.selection?.blockPath ?? null);
    let isSelectedBlockActive = selectedBlockPath && activeBlockPaths.some((path) => util.deepEqual(path, selectedBlockPath));

    return (
      <main className={viewStyles.root}>
        <TitleBar
          title={this.experiment.title}
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
                      host={this.props.host}
                      location={this.master.location}
                      protocol={this.master.protocol}
                      selectBlock={this.selectBlock.bind(this)}
                      selection={this.state.selection} />
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
                          id: 'execution',
                          label: 'Execution',
                          shortcut: 'E',
                          contents: () => (
                            <ErrorBoundary>
                              <ExecutionInspector
                                activeBlockPaths={activeBlockPaths}
                                blockPath={selectedBlockPath}
                                experiment={this.experiment}
                                host={this.props.host}
                                location={this.master.location}
                                protocol={this.master.protocol}
                                selectBlock={this.selectBlock.bind(this)} />
                            </ErrorBoundary>
                          )
                        }]
                        : []),
                      {
                        id: 'inspector',
                        label: 'Inspector',
                        shortcut: 'I',
                        contents: () => (
                          <BlockInspector
                            blockPath={selectedBlockPath}
                            footer={selectedBlockPath && !isSelectedBlockActive
                              ? [(
                                <>
                                  <Button shortcut="J" onClick={() => {
                                    let targetBlockPath = selectedBlockPath!;
                                    let commonBlockPath = List(activeBlockPaths)
                                      .map((blockPath): ProtocolBlockPath => blockPath.slice(0, getCommonBlockPathLength(blockPath, targetBlockPath)))
                                      .maxBy((commonBlockPath) => commonBlockPath.length)!;

                                    let blockAnalysis = analyzeBlockPath(this.master.protocol, this.master.location, targetBlockPath, this.globalContext);
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

                                    let commonBlockContext = createBlockContext(commonBlockPath, this.experiment.id, this.globalContext);

                                    this.pool.add(async () => {
                                      await commonBlockContext.sendMessage({
                                        type: 'jump',
                                        value: currentPoint
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
                      },
                      {
                        id: 'report',
                        label: 'Report',
                        shortcut: 'R',
                        contents: () => (
                          <ExecutionDiagnosticsReport analysis={this.master.analysis} />
                        )
                      }
                    ]} />
                )
              }
            ]} />
        </div>
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

    if (!selectedBlockPath) {
      return {
        selection: {
          blockPath: activeBlockPaths.first()!.toArray(),
          observed: true
        }
      };
    }

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


  static hash(options: ViewHashOptions<ViewExecutionRoute>) {
    return options.route.params.experimentId;
  }

  static navigate(experimentId: ExperimentId) {
    return navigation.navigate(`${BaseUrl}/experiment/${experimentId}`);
  }

  static routes = [
    { id: '_', pattern: `/experiment/:experimentId` }
  ];
}
