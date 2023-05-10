import { Chip, ChipId, ExecutionRefPath, PluginName, ProtocolBlock, ProtocolBlockPath, ProtocolLocation } from 'pr1-shared';
import * as React from 'react';

import viewStyles from '../../styles/components/view.module.scss';

import { BlockInspector } from '../components/block-inspector';
import { ExecutionInspector } from '../components/execution-inspector';
import { GraphEditor } from '../components/graph-editor';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TitleBar } from '../components/title-bar';
import { Host } from '../host';
import { MetadataTools, UnitTools } from '../unit';
import { Pool } from '../util';
import * as util from '../util';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { BaseUrl } from '../constants';
import { ViewChips } from './chips';
import { ViewChip } from './chip';
import { ExecutionDiagnosticsReport } from '../components/execution-diagnostics-report';
import { getBlockImpl } from '../protocol';
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
  selectedBlockPath: ProtocolBlockPath | null;
  toolsTabId: string | null;
  toolsOpen: boolean;
}

export class ViewExecution extends React.Component<ViewExecutionProps, ViewExecutionState> {
  pool = new Pool();
  refTitleBar = React.createRef<TitleBar>();

  constructor(props: ViewExecutionProps) {
    super(props);

    this.state = {
      selectedBlockPath: null,
      toolsTabId: 'inspector',
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

  componentDidMount() {
    this.componentDidRender();
  }

  componentDidUpdate() {
    this.componentDidRender();
  }

  selectBlock(path: ProtocolBlockPath | null, options?: { showInspector?: unknown; }) {
    this.setState({
      selectedBlockPath: path,
      toolsTabId: 'inspector'
    });

    if (options?.showInspector) {
      this.setState({
        toolsTabId: 'inspector',
        toolsOpen: true
      });
    }
  }

  render() {
    if (!this.chip?.master) {
      return null;
    }

    let context: GlobalContext = {
      host: this.props.host,
      pool: this.pool
    };

    let metadataTools = this.props.host.plugins['metadata' as PluginName] as unknown as MetadataTools;
    let metadata = metadataTools.getChipMetadata(this.chip);

    let getRefPaths = (block: ProtocolBlock, location: unknown): ProtocolBlockPath[] => {
      let blockImpl = getBlockImpl(block, context);
      let children = blockImpl.getChildren?.(block, context);

      if (!children) {
        return [[]];
      }

      let refs = blockImpl.getChildrenExecution!(block, location, context);

      if (!refs) {
        return [[]];
      }

      return Array.from(refs.entries())
        .filter(([key, ref]) => ref)
        .flatMap(([key, ref]) =>
          getRefPaths(children![key], ref!.location).map((path) => [key, ...path])
        );
    };

    let activeBlockPaths = getRefPaths(this.master.protocol.root, this.master.location);

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
                      execution={this}
                      host={this.props.host}
                      // location={this.master.location}
                      protocol={this.master.protocol}
                      selectBlock={this.selectBlock.bind(this)}
                      selectedBlockPath={this.state.selectedBlockPath} />
                  </ErrorBoundary>
                )
              },
              { nominalSize: CSSNumericValue.parse('400px'),
                onToggle: (open) => void this.setState({ toolsOpen: open }),
                open: this.state.toolsOpen,
                component: (
                  <TabNav
                    activeEntryId={this.state.toolsTabId}
                    setActiveEntryId={(id) => void this.setState({ toolsTabId: id })}
                    entries={[
                      (() => {
                        let showDefaultInspector = (this.state.selectedBlockPath) && (selectedActiveBlockPathIndex < 0) // TODO: Improve

                        return {
                          id: 'inspector',
                          label: (showDefaultInspector ? 'Inspector' : 'Execution inspector'),
                          shortcut: 'I',
                          contents: () => showDefaultInspector
                            ? (
                              <BlockInspector
                                blockPath={this.state.selectedBlockPath}
                                host={this.props.host}
                                protocol={this.master.protocol}
                                selectBlock={this.selectBlock.bind(this)} />
                            )
                            : (
                              <ErrorBoundary>
                                <ExecutionInspector
                                  activeBlockPaths={activeBlockPaths}
                                  chip={this.chip}
                                  host={this.props.host}
                                  location={this.master.location}
                                  protocol={this.master.protocol}
                                  selectBlock={this.selectBlock.bind(this)} />
                              </ErrorBoundary>
                            )
                        };
                      })(),
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
