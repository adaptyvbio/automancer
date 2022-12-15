import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';
import { MasterBlockLocation, Protocol, ProtocolBlockPath, ProtocolState } from '../interfaces/protocol';
import { Host } from '../host';
import { getBlockAggregates, getBlockExplicitLabel, getBlockLabel, getBlockState, getSegmentBlockProcessData, getSegmentBlockProcessState } from '../unit';
import { FeatureList, SimpleFeatureList } from './features';
import { ContextMenuArea } from './context-menu-area';
import { Chip } from '../backends/common';
import { getAggregateLabelItems, renderLabel } from './block-inspector';
import { Button } from './button';
import { ErrorBoundary } from './error-boundary';

import formStyles from '../../styles/components/form.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';


export interface ExecutionInspectorProps {
  activeBlockPaths: ProtocolBlockPath[];
  chip: Chip;
  host: Host;
  location: unknown;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
}

export interface ExecutionInspectorState {
  activeBlockPathIndex: number;
  hoveredBlockIndex: number | null;
}

export class ExecutionInspector extends React.Component<ExecutionInspectorProps, ExecutionInspectorState> {
  pool = new util.Pool();

  constructor(props: ExecutionInspectorProps) {
    super(props);

    this.state = {
      activeBlockPathIndex: 0,
      hoveredBlockIndex: null
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
      let location = unit.getActiveChildLocation!(parentLocation, key);

      lineBlocks.push(block);
      lineLocations.push(location);
    }

    let aggregates = getBlockAggregates(lineBlocks);
    let aggregateLabelItems = getAggregateLabelItems(aggregates, this.props.protocol.name, { host: this.props.host });

    let pausedBlockIndexRaw = lineBlocks.findIndex((block, index) => {
      let location = lineLocations[index];
      let unit = units[block.namespace];

      return unit.isBlockPaused?.(block, location, { host: this.props.host }) ?? false;
    });

    let pausedBlockIndex = (pausedBlockIndexRaw >= 0) ? pausedBlockIndexRaw : null;

    let process = getSegmentBlockProcessData(lineBlocks.at(-1), this.props.host);

    let lineStates = Array.from(lineBlocks.entries())
      .map(([index, block]) => [index, getBlockState(block)] as [number, ProtocolState])
      .filter(([index, state]) => state);

    return (
      <div className={spotlightStyles.root}>
        <div className={spotlightStyles.contents}>
          {(
            <div className={spotlightStyles.breadcrumbRoot}>
              {aggregateLabelItems /* .slice(0, -1) */ .map((item, index, arr) => {
                // let unit = units[block.namespace];
                let location = lineLocations[index];
                // let label = getBlockLabel(block, location, this.props.host)! ?? 'Untitled step';
                let last = index === (arr.length - 1);
                // let menu = unit.createActiveBlockMenu?.(block, location, { host: this.props.host }) ?? [];
                // let blockPath = activeBlockPath.slice(0, index);

                return (
                  <React.Fragment key={index}>
                    <ContextMenuArea
                      createMenu={() => item.blocks.flatMap((block, blockRelIndex, arr) => {
                        let blockIndex = item.aggregate.offset + blockRelIndex;
                        let location = lineLocations[blockIndex];
                        let unit = this.props.host.units[block.namespace];

                        let menu = (unit.createActiveBlockMenu?.(block, location, { host: this.props.host }) ?? []).map((entry) => ({
                          ...entry,
                          id: [blockRelIndex, ...[entry.id].flat()]
                        }));

                        return (menu.length > 0)
                          ? [
                            { id: [blockRelIndex, 'header'], name: unit.getBlockClassLabel?.(block) ?? block.namespace, type: 'header' },
                            ...menu
                          ]
                          : [];
                      })}
                      onSelect={(path) => {
                        console.log(path.toJS());
                        let blockRelIndex = path.first() as number;
                        let block = item.blocks[blockRelIndex];

                        let blockIndex = item.aggregate.offset + blockRelIndex;
                        let blockPath = activeBlockPath.slice(0, blockIndex);

                        let location = lineLocations[blockIndex];
                        let unit = this.props.host.units[block.namespace];

                        let message = unit.onSelectBlockMenu?.(block, location, path.slice(1));

                        if (message) {
                          this.pool.add(async () => {
                            await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, blockPath, message);
                          });
                        }
                      }}>
                      <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                        // this.props.selectBlock(this.props.blockPath!.slice(0, index));
                      }}>{renderLabel(item.label)}</button>
                    </ContextMenuArea>
                    {!last && <Icon name="chevron_right" className={spotlightStyles.breadcrumbIcon} />}
                  </React.Fragment>
                );
              })}
            </div>
          )}
          <div className={spotlightStyles.header}>
            <h2 className={spotlightStyles.title}>{renderLabel(getBlockLabel(lineBlocks.at(-1), lineLocations.at(-1), this.props.host))}</h2>
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
                <SimpleFeatureList list={[processUnit.createProcessFeatures!(process.data, {
                  host: this.props.host
                }).map((feature) => ({ ...feature, accent: true }))]} />

                <ErrorBoundary>
                  <ProcessComponent
                    host={this.props.host}
                    processData={process!.data}
                    processLocation={getSegmentBlockProcessState(segmentLocation, this.props.host)}
                    time={segmentLocation.time} />
                </ErrorBoundary>
              </>
            );
          })()}

          <FeatureList
            hoveredGroupIndex={this.state.hoveredBlockIndex}
            pausedGroupIndex={pausedBlockIndex}
            list={lineStates.map(([blockIndex, state], stateIndex) => {
              let block = lineBlocks[blockIndex];
              let location = lineLocations[blockIndex];
              let disabled = (this.state.hoveredBlockIndex !== null)
                ? (blockIndex >= this.state.hoveredBlockIndex)
                : (pausedBlockIndex !== null) && (blockIndex >= pausedBlockIndex);

              return Object.values(this.props.host.units).flatMap((unit) => {
                return unit?.createStateFeatures?.(
                  state,
                  (lineStates
                    .slice(stateIndex + 1) //, this.state.hoveredBlockIndex ?? pausedBlockIndex ?? lineBlocks.length)
                    .map(([_blockIndex, state]) => state)),
                  location.state,
                  { host: this.props.host }
                ) ?? [];
              }).map((feature) => ({
                ...feature,
                disabled: (disabled || feature.disabled)
              }));
            })}
            setHoveredGroupIndex={(hoveredBlockIndex) => void this.setState({ hoveredBlockIndex })} />
        </div>
        <div className={spotlightStyles.footerRoot}>
          <div className={formStyles.actions}>
            <Button>Pause</Button>
            <Button>Skip</Button>
          </div>
          <div>
            <div className={spotlightStyles.footerStatus}>Pausing</div>
          </div>
        </div>
      </div>
    );
  }
}
