import { List } from 'immutable';
import { Chip, ChipId, PluginName, ProtocolBlockPath } from 'pr1-shared';
import { Component, createRef } from 'react';

import viewStyles from '../../styles/components/view.module.scss';

import { BlockInspector } from '../components/block-inspector';
import { ExecutionInspector } from '../components/execution-inspector';
import { GraphEditor } from '../components/graph-editor';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TitleBar } from '../components/title-bar';
import { MetadataTools } from '../unit';
import { Pool } from '../util';
import * as util from '../util';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { BaseUrl } from '../constants';
import { ViewChips } from './chips';
import { ViewChip } from './chip';
import { ExecutionDiagnosticsReport } from '../components/execution-diagnostics-report';
import { getCommonBlockPathLength, getRefPaths } from '../protocol';
import { GlobalContext } from '../interfaces/plugin';
import { ErrorBoundary } from '../components/error-boundary';


export interface ViewExecutionRoute {
  id: '_';
  params: {
    chipId: ChipId;
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

  get chip() {
    return this.props.host.state.chips[this.props.route.params.chipId] as Chip;
  }

  get master() {
    return this.chip.master!;
  }

  componentDidRender() {
    if (!this.chip) {
      ViewChips.navigate();
    } else if (!this.chip.master) {
      if (navigation.canGoBack) {
        navigation.back();
      } else {
        ViewChip.navigate(this.chip.id);
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
      toolsTabId: 'inspector'
    });

    if (options?.showInspector) {
      this.setState({
        toolsTabId: 'inspector',
        toolsOpen: true
      });
    }
  }

  override render() {
    if (!this.chip?.master) {
      return null;
    }

    let metadataTools = this.props.host.plugins['metadata' as PluginName] as unknown as MetadataTools;
    let metadata = metadataTools.getChipMetadata(this.chip);

    let activeBlockPaths = this.activeBlockPaths;
    let selectedBlockPath = (this.state.selection?.blockPath ?? null);
    let isSelectedBlockActive = selectedBlockPath && activeBlockPaths.some((path) => util.deepEqual(path, selectedBlockPath));

    return (
      <main className={viewStyles.root}>
        <TitleBar
          title={metadata.title}
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
                                chip={this.chip}
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
    let chip = props.host.state.chips[props.route.params.chipId] as Chip;

    if (!chip?.master) {
      return null;
    }

    let globalContext: GlobalContext = {
      host: props.host,
      pool: new Pool()
    };

    let activeBlockPaths = List(getRefPaths(chip.master.protocol.root, chip.master.location, globalContext).map((blockPath) => List(blockPath)));
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
    return options.route.params.chipId;
  }

  static navigate(chipId: ChipId) {
    return navigation.navigate(`${BaseUrl}/chip/${chipId}/execution`);
  }

  static routes = [
    { id: '_', pattern: `/chip/:chipId/execution` }
  ];
}
