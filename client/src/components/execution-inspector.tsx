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
  hoveredAggregateIndex: number | null;
}

export class ExecutionInspector extends React.Component<ExecutionInspectorProps, ExecutionInspectorState> {
  pool = new util.Pool();

  constructor(props: ExecutionInspectorProps) {
    super(props);

    this.state = {
      activeBlockPathIndex: 0,
      hoveredAggregateIndex: null
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

    // let lastAggregate = aggregates.at(-1);

    let pausedAggregateIndexRaw = aggregates.findIndex((aggregate) => {
      if (!aggregate.state) {
        return false;
      }

      let block = aggregate.blocks[0];
      let location = lineLocations[aggregate.offset];
      let unit = units[block.namespace];

      return unit.isBlockPaused?.(block, location, { host: this.props.host }) ?? false;
    });

    let pausedAggregateIndex = (pausedAggregateIndexRaw >= 0) ? pausedAggregateIndexRaw : null;
    let process = getSegmentBlockProcessData(lineBlocks.at(-1), this.props.host);

    if (process && (pausedAggregateIndex === null)) {
      let block = lineBlocks.at(-1);
      let location = lineLocations.at(-1);
      let unit = units[block.namespace];

      if (unit.isBlockPaused?.(block, location, { host: this.props.host })) {
        pausedAggregateIndex = aggregates.length;
      }
    }

    // let lineStates = Array.from(lineBlocks.entries())
    //   .map(([index, block]) => [index, getBlockState(block)] as [number, ProtocolState])
    //   .filter(([index, state]) => state);

    return (
      <div className={spotlightStyles.root}>
        <div className={spotlightStyles.contents}>
          {(
            <div className={spotlightStyles.breadcrumbRoot}>
              {aggregateLabelItems /* .slice(0, -1) */ .map((item, index, arr) => {
                let last = index === (arr.length - 1);

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
                        this.props.selectBlock(activeBlockPath.slice(0, item.offset));
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
            hoveredGroupIndex={this.state.hoveredAggregateIndex}
            pausedGroupIndex={pausedAggregateIndex}
            list={aggregates.map((aggregate, aggregateIndex) => {
              let blockIndex = aggregate.offset;
              let location = lineLocations[blockIndex];
              let disabled = (this.state.hoveredAggregateIndex !== null)
                ? (aggregateIndex >= this.state.hoveredAggregateIndex)
                : (pausedAggregateIndex !== null) && (aggregateIndex >= pausedAggregateIndex);

              let ancestorStates = aggregates
                .slice(aggregateIndex + 1, this.state.hoveredAggregateIndex ?? pausedAggregateIndex ?? aggregates.length)
                .map((aggregate) => aggregate.state!);

              return Object.values(this.props.host.units).flatMap((unit) => {
                return unit?.createStateFeatures?.(
                  aggregate.state!, // TODO: Remove this assumption
                  ancestorStates,
                  location.state,
                  { host: this.props.host }
                ) ?? [];
              }).map((feature) => ({
                ...feature,
                disabled: (disabled || feature.disabled)
              }));
            })}
            setHoveredGroupIndex={(hoveredAggregateIndex) => void this.setState({ hoveredAggregateIndex })}
            setPausedGroupIndex={(aggregateIndex) => {
              this.pool.add(async () => {
                if (aggregateIndex !== null) {
                  if ((pausedAggregateIndex !== null) && (pausedAggregateIndex < aggregateIndex)) {
                    let prevAggregate = aggregates[aggregateIndex - 1];
                    await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, activeBlockPath.slice(0, prevAggregate.offset), { type: 'resume' });
                  } else {
                    let aggregate = aggregates[aggregateIndex];
                    let blockIndex = aggregate?.offset ?? (lineBlocks.length - 1);

                    await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, activeBlockPath.slice(0, blockIndex), { type: 'pause' });
                  }
                } else {
                  await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, activeBlockPath, { type: 'resume' });
                }
              });
            }} />
        </div>
        <div className={spotlightStyles.footerRoot}>
          <div className={formStyles.actions}>
            <Button onClick={() => {
              this.pool.add(async () => {
                if (pausedAggregateIndex !== null) {
                  await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, activeBlockPath, { type: 'resume' });
                } else {
                  await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, activeBlockPath.slice(0, aggregates.at(-1).offset), { type: 'pause' });
                }
              });
            }}>{(pausedAggregateIndex !== null) ? 'Resume' : 'Pause'}</Button>
            <Button onClick={() => {
              this.pool.add(async () => {
                await this.props.host.backend.sendMessageToActiveBlock(this.props.chip.id, activeBlockPath, { type: 'halt' });
              });
            }}>Skip</Button>
          </div>
          <div>
            {/* <div className={spotlightStyles.footerStatus}>Pausing</div> */}
          </div>
        </div>
      </div>
    );
  }
}
