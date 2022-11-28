import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';
import { Protocol, ProtocolBlockPath, ProtocolState } from '../interfaces/protocol';
import { Host } from '../host';
import { getBlockExplicitLabel, getBlockLabel, getBlockProcess } from '../unit';
import { FeatureGroup, FeatureList } from './features';
import { ContextMenuArea } from './context-menu-area';
import { Chip } from '../backends/common';

import formStyles from '../../styles/components/form.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';


export interface ExecutionInspectorProps {
  activeBlockPaths: ProtocolBlockPath[];
  chip: Chip;
  host: Host;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
  state: unknown;
}

export interface ExecutionInspectorState {
  activeBlockPathIndex: number;
}

export class ExecutionInspector extends React.Component<ExecutionInspectorProps, ExecutionInspectorState> {
  pool = new util.Pool();

  constructor(props: ExecutionInspectorProps) {
    super(props);

    this.state = {
      activeBlockPathIndex: 0
    };
  }

  render() {
    let activeBlockPath = this.props.activeBlockPaths[this.state.activeBlockPathIndex];

    let lineBlocks = [this.props.protocol.root];
    let lineStates = [this.props.state];

    for (let key of activeBlockPath) {
      let parentBlock = lineBlocks.at(-1);
      let parentState = lineStates.at(-1);
      let unit = this.props.host.units[parentBlock.namespace];
      let block = unit.getChildBlock!(parentBlock, key);
      let state = unit.getActiveChildState!(parentState, key);

      lineBlocks.push(block);
      lineStates.push(state);
    }

    return (
      <div className={util.formatClass(formStyles.main2, spotlightStyles.root)}>
        {(lineBlocks.length > 1) && (
          <div className={spotlightStyles.breadcrumbRoot}>
            {lineBlocks /* .slice(0, -1) */ .map((block, index, arr) => {
              let unit = this.props.host.units[block.namespace];
              let state = lineStates[index];
              let label = getBlockLabel(block, state, this.props.host)! ?? 'Untitled step';
              let last = index === (arr.length - 1);
              let menu = unit.createActiveBlockMenu?.(block, state) ?? [];

              return (
                <React.Fragment key={index}>
                  <ContextMenuArea
                    createMenu={() => [
                      { id: 'header', name: unit.getBlockClassLabel?.(block) ?? label, type: 'header' },
                      // { id: 'pause', name: 'Pause', icon: 'pause_circle' },
                      // ...((menu.length > 0) ? [{ id: 'divider', type: 'divider' }] : []),
                      ...menu
                    ]}
                    onSelect={(path) => {
                      let message = unit.onSelectBlockMenu?.(block, state, path);

                      if (message) {
                        this.pool.add(async () => {
                          await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, activeBlockPath, message);
                        });
                      }
                    }}>
                    <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                      // this.props.selectBlock(this.props.blockPath!.slice(0, index));
                    }}>{label}</button>
                  </ContextMenuArea>
                  {!last && <Icon name="chevron_right" className={spotlightStyles.breadcrumbIcon} />}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <div className={spotlightStyles.header}>
          <h2 className={spotlightStyles.title}>{getBlockLabel(lineBlocks.at(-1), lineStates.at(-1), this.props.host) ?? <i>Untitled step</i>}</h2>
          <div className={spotlightStyles.navigationRoot}>
            <button type="button" className={spotlightStyles.navigationButton} disabled={this.state.activeBlockPathIndex === 0}>
              <Icon name="chevron_left" className={spotlightStyles.navigationIcon} />
            </button>
            <button type="button" className={spotlightStyles.navigationButton} disabled={this.state.activeBlockPathIndex === (this.props.activeBlockPaths.length - 1)}>
              <Icon name="chevron_right" className={spotlightStyles.navigationIcon} />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
