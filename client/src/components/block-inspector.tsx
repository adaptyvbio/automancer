import { Protocol, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import * as React from 'react';
import { Fragment } from 'react';

import featureStyles from '../../styles/components/features.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Host } from '../host';
import { PluginBlockEntry, PluginContext } from '../interfaces/plugin';
import { ProtocolBlockAggregate } from '../interfaces/protocol';
import { UnitContext } from '../interfaces/unit';
import { getBlockAggregates, UnitTools } from '../unit';
import * as util from '../util';
import { ErrorBoundary } from './error-boundary';
import { SimpleFeatureList } from './features';
import { Icon } from './icon';


export interface PluginBlockEntryInfos {
  block: ProtocolBlock;
  entry: PluginBlockEntry;
}


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
      return (
        <div className={spotlightStyles.placeholder}>
          <p>Nothing selected</p>
        </div>
      );
    }

    let getBlockImpl = (block: ProtocolBlock) => this.props.host.plugins[block.namespace].blocks[block.name];

    let currentBlock = this.props.protocol.root;
    let lineBlocks: ProtocolBlock[] = [currentBlock];
    let lastLeadTransformedBlockIndex = -1;

    for (let [blockIndex, key] of this.props.blockPath.entries()) {
      let currentBlockImpl = getBlockImpl(currentBlock);
      currentBlock = currentBlockImpl.getChild!(currentBlock, key);
      lineBlocks.push(currentBlock);

      if (currentBlockImpl.computeGraph) {
        lastLeadTransformedBlockIndex = blockIndex;
      }
    }

    let leafBlock = lineBlocks.at(-1);
    let title: string | null = null;

    let entryInfos: PluginBlockEntryInfos[] = [];
    let breadcrumbItems: {
      path: ProtocolBlockPath;
      value: string;
    }[] = [];

    for (let [blockIndex, block] of lineBlocks.entries()) {
      if (block.namespace === 'name') {
        let nameBlock = block as (ProtocolBlock & {
          value: string;
        });

        breadcrumbItems.push({
          path: this.props.blockPath.slice(0, blockIndex),
          value: nameBlock.value
        });

        if (blockIndex > lastLeadTransformedBlockIndex) {
          title = nameBlock.value;
        }
      }

      for (let entry of (getBlockImpl(block).createEntries?.(block, null) ?? [])) {
        entryInfos.push({
          block,
          entry
        });
      }
    }

    return (
      <div className={util.formatClass(spotlightStyles.root, spotlightStyles.contents)}>
        {(breadcrumbItems.length > 0) && (
          <div className={spotlightStyles.breadcrumbRoot}>
            {breadcrumbItems.map((item, itemIndex, arr) => {
              let last = itemIndex === (arr.length - 1);

              return (
                <Fragment key={itemIndex}>
                  <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                    this.props.selectBlock(item.path);
                  }}>{item.value}</button>
                  {!last && <Icon name="chevron_right" className={spotlightStyles.breadcrumbIcon} />}
                </Fragment>
              );
            })}
          </div>
        )}
        <div className={spotlightStyles.header}>
          <h2 className={spotlightStyles.title}>{title ?? getBlockImpl(leafBlock).getClassLabel?.(leafBlock) ?? 'Unknown'}</h2>
        </div>

        <div className={featureStyles.group}>
          {Array.from(entryInfos).reverse().map(({ block, entry }) => (
            entry.features.map((feature, featureIndex) => (
              <div className={featureStyles.entry} key={featureIndex}>
                <Icon name={feature.icon} className={featureStyles.icon} />
                <div className={featureStyles.body}>
                  {feature.description && <div className={featureStyles.description}>{feature.description}</div>}
                  <div className={featureStyles.label}>{feature.label}</div>
                </div>
                <Icon name="power_off" className={featureStyles.errorIcon} />
                <button type="button" className={featureStyles.action}>
                  <Icon name="expand_more" />
                </button>
              </div>
            ))
          ))}
        </div>
      </div>
    );
  }
}


export function renderLabel(label: ReturnType<typeof UnitTools.getBlockLabel>) {
  return (
    <>
      {label.explicit
        ? label.value
        : <i>{label.value}</i>}
      {label.suffix && (' ' + label.suffix)}
    </>
  );
}

export function getAggregateLabelItems(aggregates: ProtocolBlockAggregate[], locations: unknown[] | null, protocolName: string | null, context: UnitContext) {
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
        let unit = UnitTools.asBlockUnit(context.host.units[block.namespace])!;
        let location = locations?.[aggregate.offset + blockIndex];

        if (!unit.getBlockLabel) {
          return [];
        }

        return [{
          aggregate,
          blocks: blockIndex === 1 // TODO: Improve this
            ? [aggregate.blocks[0], block]
            : [block],
          label: UnitTools.getBlockLabel(block, location, context.host),
          offset: aggregate.offset + blockIndex
        }];
      });
    }
  });
}
