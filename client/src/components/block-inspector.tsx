import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';
import { Protocol, ProtocolBlock, ProtocolBlockAggregate, ProtocolBlockPath, ProtocolState } from '../interfaces/protocol';
import { Host } from '../host';
import { getBlockAggregates, getBlockLabel, getBlockState, getBlockStateName, getSegmentBlockProcessData } from '../unit';
import { SimpleFeatureList } from './features';

import formStyles from '../../styles/components/form.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';


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

    let targetBlock = this.props.protocol.root;
    let lineBlocks = [targetBlock];

    for (let key of this.props.blockPath) {
      let unit = this.props.host.units[targetBlock.namespace];
      targetBlock = unit.getChildBlock!(targetBlock, key);
      lineBlocks.push(targetBlock);
    }

    let lineLabels = lineBlocks.map((block) => {
      return getBlockLabel(block, null, this.props.host);
    });

    let process = getSegmentBlockProcessData(targetBlock, this.props.host);
    let processUnit = process && this.props.host.units[process.namespace];

    let lineStates = lineBlocks
      .map(getBlockState)
      .filter((state): state is ProtocolState => state !== null);

    let aggregates = getBlockAggregates(lineBlocks);
    let aggregateLabelItems = getAggregateLabelItems(aggregates, this.props.protocol.name, { host: this.props.host });

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

        {(process && processUnit) && (
          <SimpleFeatureList list={[processUnit.createProcessFeatures!(process.data, {
            host: this.props.host
          }).map((feature) => ({ ...feature, accent: true }))]} />
        )}

        <SimpleFeatureList list={lineStates.map((state, index) => {
          return Object.values(this.props.host.units).flatMap((unit) => {
            return unit?.createStateFeatures?.(
              state,
              lineStates.slice(index + 1),
              null,
              { host: this.props.host }
            ) ?? [];
          });
        })} />
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

export function getAggregateLabelItems(aggregates: ProtocolBlockAggregate[], protocolName: string | null, options: { host: Host; }) {
  return aggregates.flatMap((aggregate, aggregateIndex) => {
    let label = aggregate.state && getBlockStateName(aggregate.state);

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
        let unit = options.host.units[block.namespace];

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
            value: unit.getBlockDefaultLabel(block, options.host) ?? 'Block'
          },
          offset: aggregate.offset + blockIndex
        }];
      });
    }
  });
}
