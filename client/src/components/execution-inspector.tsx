import { Chip, UnitNamespace } from 'pr1-shared';
import * as React from 'react';

import formStyles from '../../styles/components/form.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Icon } from './icon';
import * as util from '../util';
import { Protocol, ProtocolBlockPath } from '../interfaces/protocol';
import { Host } from '../host';
import { getBlockAggregates, UnitTools } from '../unit';
import { FeatureList } from './features';
import { ContextMenuArea } from './context-menu-area';
import { getAggregateLabelItems, renderLabel } from './block-inspector';
import { Button } from './button';
import { ErrorBoundary } from './error-boundary';
import { UnitContext } from '../interfaces/unit';


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
    let context = {
      host: this.props.host
    } satisfies UnitContext;
    let units = this.props.host.units;

    let activeBlockPath = this.props.activeBlockPaths[this.state.activeBlockPathIndex];
    let activeExecPath: number[] = [];

    let lineBlocks = [this.props.protocol.root];
    let lineLocations = [this.props.location];

    for (let key of activeBlockPath) {
      let parentBlock = lineBlocks.at(-1);
      let parentLocation = lineLocations.at(-1);

      let unit = UnitTools.asBlockUnit(units[parentBlock.namespace])!;
      let refs = unit.getChildrenExecutionRefs(parentBlock, parentLocation)!;
      let ref = refs.find((ref) => ref.blockKey === key)!;

      activeExecPath.push(ref.executionId);

      let block = unit.getChildBlock(parentBlock, key);
      let location = unit.getActiveChildLocation!(parentLocation, ref.executionId);

      lineBlocks.push(block);
      lineLocations.push(location);
    }

    let aggregates = getBlockAggregates(lineBlocks);
    let aggregateLabelItems = getAggregateLabelItems(aggregates, lineLocations, this.props.protocol.name, context);

    let pausedAggregateIndexRaw = aggregates.findIndex((aggregate) => {
      if (!aggregate.state) {
        return false;
      }

      let block = aggregate.blocks[0];
      let location = lineLocations[aggregate.offset];
      let unit = UnitTools.asBlockUnit(units[block.namespace])!;

      return unit.isBlockPaused?.(block, location, context) ?? false;
    });

    let pausedAggregateIndex = (pausedAggregateIndexRaw >= 0) ? pausedAggregateIndexRaw : null;

    let headUnit = UnitTools.asHeadUnit(units[lineBlocks.at(-1).namespace])!;
    let HeadComponent = headUnit.HeadComponent;

    if (pausedAggregateIndex === null) {
      let block = lineBlocks.at(-1);
      let location = lineLocations.at(-1);

      if (headUnit.isBlockPaused?.(block, location, context)) {
        pausedAggregateIndex = aggregates.length;
      }
    }

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
                        let unit = UnitTools.asBlockUnit(units[block.namespace])!;

                        let menu = (unit.createActiveBlockMenu?.(block, location, { host: this.props.host }) ?? []).map((entry) => ({
                          ...entry,
                          id: [blockRelIndex, ...[entry.id].flat()]
                        }));

                        return (menu.length > 0)
                          ? [
                            { id: [blockRelIndex, 'header'], name: unit.getBlockClassLabel?.(block, context) ?? block.namespace, type: 'header' },
                            ...menu
                          ]
                          : [];
                      })}
                      onSelect={(path) => {
                        let blockRelIndex = path.first() as number;
                        let block = item.blocks[blockRelIndex];

                        let blockIndex = item.aggregate.offset + blockRelIndex;
                        let blockPath = activeBlockPath.slice(0, blockIndex);
                        let execPath = activeExecPath.slice(0, blockIndex);

                        let location = lineLocations[blockIndex];
                        let unit = UnitTools.asBlockUnit(units[block.namespace])!;

                        let message = unit.onSelectBlockMenu?.(block, location, path.slice(1));

                        if (message) {
                          this.pool.add(async () => {
                            await this.props.host.client.request({
                              type: 'sendMessageToActiveBlock',
                              chipId: this.props.chip.id,
                              path: execPath, message
                            });
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
            <h2 className={spotlightStyles.title}>{renderLabel(UnitTools.getBlockLabel(lineBlocks.at(-1), lineLocations.at(-1), this.props.host))}</h2>
            <div className={spotlightStyles.navigationRoot}>
              <button type="button" className={spotlightStyles.navigationButton} disabled={this.state.activeBlockPathIndex === 0}>
                <Icon name="chevron_left" className={spotlightStyles.navigationIcon} />
              </button>
              <button type="button" className={spotlightStyles.navigationButton} disabled={this.state.activeBlockPathIndex === (this.props.activeBlockPaths.length - 1)}>
                <Icon name="chevron_right" className={spotlightStyles.navigationIcon} />
              </button>
            </div>
          </div>

          {HeadComponent && (
            <ErrorBoundary>
              <HeadComponent
                block={lineBlocks.at(-1)}
                context={context}
                location={lineLocations.at(-1)} />
            </ErrorBoundary>
          )}

          <FeatureList
            indexOffset={aggregates.findIndex((aggregate) => aggregate.state)}
            hoveredGroupIndex={this.state.hoveredAggregateIndex}
            pausedGroupIndex={pausedAggregateIndex}
            list={
              Array.from(aggregates.entries())
                .filter(([_aggregateIndex, aggregate]) => aggregate.state)
                .map(([aggregateIndex, aggregate]) => {
                  let blockIndex = aggregate.offset;
                  let location = lineLocations[blockIndex] as {
                    state: Record<UnitNamespace, {
                      location: unknown;
                      settled: boolean;
                    }> | null;
                  };

                  let disabled = (this.state.hoveredAggregateIndex !== null)
                    ? (aggregateIndex >= this.state.hoveredAggregateIndex)
                    : (pausedAggregateIndex !== null) && (aggregateIndex >= pausedAggregateIndex);

                  let ancestorStates = aggregates
                    .slice(aggregateIndex + 1, this.state.hoveredAggregateIndex ?? pausedAggregateIndex ?? aggregates.length)
                    .map((aggregate) => aggregate.state!);

                  return Object.values(units).flatMap((unit) => {
                    return (unit.namespace in aggregate.state!)
                      ? UnitTools.asStateUnit(unit)?.createStateFeatures?.(
                        aggregate.state![unit.namespace],
                        ancestorStates.map((state) => state[unit.namespace]),
                        location.state?.[unit.namespace].location,
                        context
                      ) ?? []
                      : [];
                  }).map((feature) => ({
                    ...feature,
                    disabled: (disabled || feature.disabled)
                  }));
                })
            }
            setHoveredGroupIndex={(hoveredAggregateIndex) => void this.setState({ hoveredAggregateIndex })}
            setPausedGroupIndex={(aggregateIndex) => {
              this.pool.add(async () => {
                if (aggregateIndex !== null) {
                  if ((pausedAggregateIndex !== null) && (pausedAggregateIndex < aggregateIndex)) {
                    let prevAggregate = aggregates[aggregateIndex - 1];
                    await this.props.host.client.request({
                      type: 'sendMessageToActiveBlock',
                      chipId: this.props.chip.id,
                      path: activeExecPath.slice(0, prevAggregate.offset),
                      message: { type: 'resume' }
                    });
                  } else {
                    let aggregate = aggregates[aggregateIndex];
                    let blockIndex = aggregate?.offset ?? (lineBlocks.length - 1);

                    await this.props.host.client.request({
                      type: 'sendMessageToActiveBlock',
                      chipId: this.props.chip.id,
                      path: activeExecPath.slice(0, blockIndex),
                      message: { type: 'pause' }
                    });
                  }
                } else {
                  await this.props.host.client.request({
                    type: 'sendMessageToActiveBlock',
                    chipId: this.props.chip.id,
                    path: activeExecPath,
                    message: { type: 'resume' }
                  });
                }
              });
            }} />
        </div>
        <div className={spotlightStyles.footerRoot}>
          <div className={formStyles.actions}>
            <Button onClick={() => {
              this.pool.add(async () => {
                if (pausedAggregateIndex !== null) {
                  await this.props.host.client.request({
                    type: 'sendMessageToActiveBlock',
                    chipId: this.props.chip.id,
                    path: activeExecPath,
                    message: { type: 'resume' }
                  });
                } else {
                  await this.props.host.client.request({
                    type: 'sendMessageToActiveBlock',
                    chipId: this.props.chip.id,
                    path: activeExecPath.slice(0, aggregates.at(-1).offset),
                    message: { type: 'pause' }
                  });
                }
              });
            }}>{(pausedAggregateIndex !== null) ? 'Resume' : 'Pause'}</Button>
            <Button onClick={() => {
              this.pool.add(async () => {
                await this.props.host.client.request({
                  type: 'sendMessageToActiveBlock',
                  chipId: this.props.chip.id,
                  path: activeExecPath,
                  message: { type: 'halt' }
                });
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
