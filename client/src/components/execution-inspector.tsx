import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';
import { MasterBlockLocation, Protocol, ProtocolBlockPath, ProtocolState } from '../interfaces/protocol';
import { Host } from '../host';
import { getBlockExplicitLabel, getBlockLabel, getSegmentBlockProcessData, getSegmentBlockProcessState } from '../unit';
import { FeatureGroup, FeatureList } from './features';
import { ContextMenuArea } from './context-menu-area';
import { Chip } from '../backends/common';

import formStyles from '../../styles/components/form.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';


export interface ExecutionInspectorProps {
  activeBlockPaths: ProtocolBlockPath[];
  chip: Chip;
  host: Host;
  location: MasterBlockLocation;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
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
    let units = this.props.host.units;
    let activeBlockPath = this.props.activeBlockPaths[this.state.activeBlockPathIndex];

    let lineBlocks = [this.props.protocol.root];
    let lineLocations = [this.props.location];

    for (let key of activeBlockPath) {
      let parentBlock = lineBlocks.at(-1);
      let parentLocation = lineLocations.at(-1);
      let unit = units[parentBlock.namespace];
      let block = unit.getChildBlock!(parentBlock, key);
      let location = unit.getActiveChildState!(parentLocation, key);

      lineBlocks.push(block);
      lineLocations.push(location);
    }

    let process = getSegmentBlockProcessData(lineBlocks.at(-1), this.props.host);

    return (
      <div className={util.formatClass(formStyles.main2, spotlightStyles.root)}>
        {(lineBlocks.length > 1) && (
          <div className={spotlightStyles.breadcrumbRoot}>
            {lineBlocks /* .slice(0, -1) */ .map((block, index, arr) => {
              let unit = units[block.namespace];
              let location = lineLocations[index];
              let label = getBlockLabel(block, location, this.props.host)! ?? 'Untitled step';
              let last = index === (arr.length - 1);
              let menu = unit.createActiveBlockMenu?.(block, location) ?? [];

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
                      let message = unit.onSelectBlockMenu?.(block, location, path);

                      if (message) {
                        this.pool.add(async () => {
                          await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, activeBlockPath.slice(0, index), message);
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
          <h2 className={spotlightStyles.title}>{getBlockLabel(lineBlocks.at(-1), lineLocations.at(-1), this.props.host) ?? <i>Untitled step</i>}</h2>
          <div className={spotlightStyles.navigationRoot}>
            <button type="button" className={spotlightStyles.navigationButton} disabled={this.state.activeBlockPathIndex === 0}>
              <Icon name="chevron_left" className={spotlightStyles.navigationIcon} />
            </button>
            <button type="button" className={spotlightStyles.navigationButton} disabled={this.state.activeBlockPathIndex === (this.props.activeBlockPaths.length - 1)}>
              <Icon name="chevron_right" className={spotlightStyles.navigationIcon} />
            </button>
          </div>
        </div>

        {process && (() => {
          let processUnit = units[process.namespace];
          let ProcessComponent = processUnit.ProcessComponent!;
          let segmentLocation = lineLocations.at(-1) as any;

          return (
            <>
              <FeatureList list={[processUnit.createProcessFeatures!(process.data, {
                host: this.props.host
              }).map((feature) => ({ ...feature, accent: true }))]} />
              <ProcessComponent
                host={this.props.host}
                processData={process!.data}
                processLocation={getSegmentBlockProcessState(segmentLocation, this.props.host)}
                time={segmentLocation.time} />
            </>
          );
        })()}

        <FeatureList list={lineBlocks.flatMap((block, index) => {
          let location = lineLocations[index];

          return block.state
            ? [Object.values(this.props.host.units).flatMap((unit) => {
              return unit?.createStateFeatures?.(
                block.state!,
                (lineBlocks
                  .slice(index + 1)
                  .map((b) => b.state)
                  .filter((s) => s)) as ProtocolState[],
                location.state,
                { host: this.props.host }
              ) ?? [];
            })]
            : [];
        }).reverse()} />
      </div>
    );
  }
}
