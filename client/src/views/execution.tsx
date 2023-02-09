import * as React from 'react';

import viewStyles from '../../styles/components/view.module.scss';

import { Chip, ChipId } from '../backends/common';
import { BlockInspector } from '../components/block-inspector';
import { ExecutionInspector } from '../components/execution-inspector';
import { GraphEditor } from '../components/graph-editor';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TitleBar } from '../components/title-bar';
import { Host } from '../host';
import { ProtocolBlock, ProtocolBlockPath } from '../interfaces/protocol';
import { MetadataTools, UnitTools } from '../unit';
import { Pool } from '../util';
import * as util from '../util';
import { ViewHashOptions, ViewProps } from '../interfaces/view';
import { BaseUrl } from '../constants';
import { ViewChips } from './chips';
import { ViewChip } from './chip';
import { DiagnosticsReport } from '../components/diagnostics-report';


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

  jump(point: unknown) {
    this.pool.add(async () => {
      await this.props.host.backend.sendMessageToActiveBlock(this.chip.id, [], {
        type: 'jump',
        point
      });
    });
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

    let metadataTools = this.props.host.units.metadata as unknown as MetadataTools;
    let metadata = metadataTools.getChipMetadata(this.chip);

    // let block = this.master.protocol.root;
    // let getExecutionInfo = (block: ProtocolBlock, state: unknown) => {
    //   let unit = this.props.host.units[block.namespace];
    //   return unit.getExecutionInfo(block, state, { getExecutionInfo });
    // };

    let getActiveBlockPaths = (block: ProtocolBlock, location: unknown, path: ProtocolBlockPath): ProtocolBlockPath[] => {
      let unit = UnitTools.asBlockUnit(this.props.host.units[block.namespace])!;
      let refs = unit.getChildrenExecutionRefs(block, location);

      return refs
        ? refs.flatMap((ref) => getActiveBlockPaths(
            unit.getChildBlock!(block, ref.blockKey),
            unit.getActiveChildLocation!(location, ref.executionId),
            [...path, ref.blockKey]
          ))
        : [path];
    };

    let activeBlockPaths = getActiveBlockPaths(this.master.protocol.root, this.master.location, []);

    let selectedActiveBlockPathIndex = this.state.selectedBlockPath
      ? activeBlockPaths.findIndex((path) => util.deepEqual(path, this.state.selectedBlockPath))
      : -1;

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
                  <GraphEditor
                    execution={this}
                    host={this.props.host}
                    selectBlock={this.selectBlock.bind(this)}
                    selectedBlockPath={this.state.selectedBlockPath}
                    location={this.master.location}
                    tree={this.master.protocol.root} />
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
                          contents: () => showDefaultInspector
                            ? (
                              <BlockInspector
                                blockPath={this.state.selectedBlockPath}
                                host={this.props.host}
                                protocol={this.master.protocol}
                                selectBlock={this.selectBlock.bind(this)} />
                            )
                            : (
                              <ExecutionInspector
                                activeBlockPaths={activeBlockPaths}
                                chip={this.chip}
                                host={this.props.host}
                                location={this.master.location}
                                protocol={this.master.protocol}
                                selectBlock={this.selectBlock.bind(this)} />
                            )
                        };
                      })(),
                      {
                        id: 'report',
                        label: 'Report',
                        contents: () => (
                          <DiagnosticsReport diagnostics={this.master.errors.slice().reverse().map((error, index) => ({
                            id: error.id ?? index,
                            kind: 'error',
                            message: error.message,
                            ranges: []
                          }))} />
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
