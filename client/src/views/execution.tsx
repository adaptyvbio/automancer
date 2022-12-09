import * as React from 'react';

import type { Application, Route } from '../application';
import { Chip, ChipId } from '../backends/common';
import { ExecutionInspector } from '../components/execution-inspector';
import { GraphEditor } from '../components/graph-editor';
import { SplitPanels } from '../components/split-panels';
import { TabNav } from '../components/tab-nav';
import { TitleBar } from '../components/title-bar';
import { Host } from '../host';
import { MasterBlockLocation, ProtocolBlock, ProtocolBlockPath } from '../interfaces/protocol';
import { MetadataTools } from '../unit';
import { Pool } from '../util';

import viewStyles from '../../styles/components/view.module.scss';


export interface ViewExecutionProps {
  app: Application;
  chipId: ChipId;
  host: Host;
  setRoute(route: Route): void;
}

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
    return this.props.host.state.chips[this.props.chipId] as Chip;
  }

  get master() {
    return this.chip.master!;
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
      selectedBlockPath: path
    });

    if (options?.showInspector) {
      this.setState({
        toolsTabId: 'inspector',
        toolsOpen: true
      });
    }
  }

  render() {
    let metadataTools = this.props.host.units.metadata as unknown as MetadataTools;
    let metadata = metadataTools.getChipMetadata(this.chip);

    // let block = this.master.protocol.root;
    // let getExecutionInfo = (block: ProtocolBlock, state: unknown) => {
    //   let unit = this.props.host.units[block.namespace];
    //   return unit.getExecutionInfo(block, state, { getExecutionInfo });
    // };

    let getActiveBlockPaths = (block: ProtocolBlock, location: MasterBlockLocation, path: ProtocolBlockPath): ProtocolBlockPath[] => {
      let unit = this.props.host.units[block.namespace];
      let keys = unit.getChildrenExecutionKeys!(block, location);

      return keys
        ? keys.flatMap((key) => getActiveBlockPaths(
            unit.getChildBlock!(block, key),
            unit.getActiveChildState!(location, key),
            [...path, key]
          ))
        : [path];
    };

    let activeBlockPaths = getActiveBlockPaths(this.master.protocol.root, this.master.location, []);

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
                    state={this.master.location}
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
                      {
                        id: 'inspector',
                        label: 'Inspector',
                        contents: () => (
                          <ExecutionInspector
                            activeBlockPaths={activeBlockPaths}
                            chip={this.chip}
                            // blockPath={this.state.selectedBlockPath}
                            host={this.props.host}
                            location={this.master.location}
                            protocol={this.master.protocol}
                            selectBlock={this.selectBlock.bind(this)} />
                          // <BlockInspector
                          //   blockPath={this.state.selectedBlockPath}
                          //   host={this.props.host}
                          //   protocol={this.master.protocol}
                          //   selectBlock={this.selectBlock.bind(this)} />
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
}
