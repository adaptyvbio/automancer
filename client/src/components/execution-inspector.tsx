import { Chip, Protocol, ProtocolBlockPath } from 'pr1-shared';
import * as React from 'react';
import { Fragment } from 'react';

import formStyles from '../../styles/components/form.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Icon } from './icon';
import * as util from '../util';
import { Host } from '../host';
import { getBlockAggregates, UnitTools } from '../unit';
import { FeatureList } from './features';
import { ContextMenuArea } from './context-menu-area';
import { getAggregateLabelItems, renderLabel } from './block-inspector';
import { Button } from './button';
import { ErrorBoundary } from './error-boundary';
import { PluginContext } from '../interfaces/plugin';
import { Pool } from '../util';
import { analyzeBlockPath, getBlockImpl } from '../protocol';


export interface ExecutionInspectorProps {
  activeBlockPaths: ProtocolBlockPath[];
  chip: Chip;
  host: Host;
  location: unknown;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
}

export interface ExecutionInspectorState {
  selectedBlockPathIndex: number;
}

export class ExecutionInspector extends React.Component<ExecutionInspectorProps, ExecutionInspectorState> {
  pool = new Pool();

  constructor(props: ExecutionInspectorProps) {
    super(props);

    this.state = {
      selectedBlockPathIndex: 0
    };
  }

  render() {
    let context: PluginContext = {
      host: this.props.host
    };

    let blockPath = this.props.activeBlockPaths[this.state.selectedBlockPathIndex];

    let blockAnalysis = analyzeBlockPath(this.props.protocol, this.props.location, blockPath, { host: this.props.host });

    let ancestorGroups = blockAnalysis.groups.slice(0, -1);
    let leafGroup = blockAnalysis.groups.at(-1);

    let leafPair = blockAnalysis.pairs.at(-1);
    let leafBlockImpl = getBlockImpl(leafPair.block, context);

    return (
      <div className={spotlightStyles.root}>
        <div className={spotlightStyles.contents}>
          {(
            <div className={spotlightStyles.breadcrumbRoot}>
              {ancestorGroups.map((group, groupIndex, arr) => {
                let last = groupIndex === (arr.length - 1);

                return (
                  <Fragment key={groupIndex}>
                    <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                      this.props.selectBlock(group.path);
                    }}>{group.name ?? <i>Untitled</i>}</button>
                    {!last && <Icon name="chevron_right" className={spotlightStyles.breadcrumbIcon} />}
                  </Fragment>
                );
              })}

              {/* {aggregateLabelItems .map((item, index, arr) => {
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
              })} */}
            </div>
          )}
          <div className={spotlightStyles.header}>
            <h2 className={spotlightStyles.title}>{leafGroup.name ?? <i>{leafBlockImpl.getLabel?.(leafPair.block) ?? 'Untitled'}</i>}</h2>
            <div className={spotlightStyles.navigationRoot}>
              <button type="button" className={spotlightStyles.navigationButton} disabled={this.state.selectedBlockPathIndex === 0}>
                <Icon name="chevron_left" className={spotlightStyles.navigationIcon} />
              </button>
              <button type="button" className={spotlightStyles.navigationButton} disabled={this.state.selectedBlockPathIndex === (this.props.activeBlockPaths.length - 1)}>
                <Icon name="chevron_right" className={spotlightStyles.navigationIcon} />
              </button>
            </div>
          </div>

          {leafBlockImpl.Component && (
            <ErrorBoundary>
              <leafBlockImpl.Component
                block={leafPair.block}
                context={context}
                location={leafPair.location} />
            </ErrorBoundary>
          )}

          {/* <FeatureList
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
            }} /> */}
        </div>
        {/* <div className={spotlightStyles.footerRoot}>
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
            {/* <div className={spotlightStyles.footerStatus}>Pausing</div>
          </div>
        </div> */}
      </div>
    );
  }
}
