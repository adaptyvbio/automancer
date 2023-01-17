import * as React from 'react';

import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Icon } from './icon';
import * as util from '../util';
import { Protocol, ProtocolBlock, ProtocolBlockAggregate, ProtocolBlockPath, ProtocolState } from '../interfaces/protocol';
import { Host } from '../host';
import { getBlockAggregates, UnitTools } from '../unit';
import { SimpleFeatureList } from './features';
import { UnitContext } from '../interfaces/unit';
import { ErrorBoundary } from './error-boundary';


export interface BlockInspectorProps {
  blockPath: ProtocolBlockPath | null;
  host: Host;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
}

export interface BlockInspectorState {

}

export class BlockInspector extends React.Component<BlockInspectorProps, BlockInspectorState> {
  constructor(props: BlockInspectorProps) {
    super(props);

    this.state = {};
  }

  render() {
    if (!this.props.blockPath) {
      return <div />;
    }

    let context = {
      host: this.props.host
    } satisfies UnitContext;
    let units = this.props.host.units;

    let targetBlock = this.props.protocol.root;
    let lineBlocks = [targetBlock];

    for (let key of this.props.blockPath) {
      let unit = UnitTools.asBlockUnit(units[targetBlock.namespace])!;
      targetBlock = unit.getChildBlock(targetBlock, key);
      lineBlocks.push(targetBlock);
    }

    let aggregates = getBlockAggregates(lineBlocks)
    let aggregateLabelItems = getAggregateLabelItems(aggregates, this.props.protocol.name, context);

    let headUnit = UnitTools.asBlockUnit(units[lineBlocks.at(-1).namespace])!;
    let HeadComponent = headUnit.HeadComponent;

    return (
      <div className={util.formatClass(spotlightStyles.root, spotlightStyles.contents)}>
        {(
          <div className={spotlightStyles.breadcrumbRoot}>
            {aggregateLabelItems.map((item, itemIndex, arr) => {
              let last = itemIndex === (arr.length - 1);

              return (
                <React.Fragment key={itemIndex}>
                  <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                    this.props.selectBlock(this.props.blockPath!.slice(0, item.offset));
                  }}>{renderLabel(item.label)}</button>
                  {!last && <Icon name="chevron_right" className={spotlightStyles.breadcrumbIcon} />}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <div className={spotlightStyles.header}>
          <h2 className={spotlightStyles.title}>{renderLabel(aggregateLabelItems.at(-1).label)}</h2>
        </div>

        {HeadComponent && (
          <ErrorBoundary>
            <HeadComponent
              block={lineBlocks.at(-1)}
              context={context}
              location={null} />
          </ErrorBoundary>
        )}

        <SimpleFeatureList list={
          Array.from(aggregates.entries())
            .filter(([_aggregateIndex, aggregate]) => aggregate.state)
            .map(([aggregateIndex, aggregate]) => {
              return Object.values(units).flatMap((unit) => {
                return UnitTools.asStateUnit(unit)?.createStateFeatures?.(
                  aggregate.state![unit.namespace],
                  aggregates
                    .slice(aggregateIndex + 1)
                    .map((aggregate) => aggregate.state![unit.namespace]),
                  null,
                  context
                ) ?? [];
              });
            })
        } />
      </div>
    );
  }
}


export function renderLabel(label: ReturnType<typeof getBlockLabel>) {
  return (
    <>
      {label.explicit
        ? label.value
        : <i>{label.value}</i>}
      {label.suffix && (' ' + label.suffix)}
    </>
  );
}

export function getAggregateLabelItems(aggregates: ProtocolBlockAggregate[], protocolName: string | null, context: UnitContext) {
  return aggregates.flatMap((aggregate, aggregateIndex) => {
    let label = aggregate.state && UnitTools.getBlockStateNameFromState(aggregate.state);

    if (aggregateIndex < 1) {
      label ??= protocolName;
    }

    if (label) {
      return [{
        aggregate,
        blocks: aggregate.blocks,
        label: {
          explicit: true,
          suffix: null,
          value: label
        },
        offset: aggregate.offset + aggregate.blocks.length - 1
      }];
    } else {
      return aggregate.blocks.flatMap((block, blockIndex) => {
        let unit = context.host.units[block.namespace];

        if (!unit.getBlockDefaultLabel) {
          return [];
        }

        return [{
          aggregate,
          blocks: blockIndex === 1 // TODO: Improve this
            ? [aggregate.blocks[0], block]
            : [block],
          label: {
            explicit: false,
            suffix: null,
            value: unit.getBlockDefaultLabel(block, context.host) ?? 'Block'
          },
          offset: aggregate.offset + blockIndex
        }];
      });
    }
  });
}
