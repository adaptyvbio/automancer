import { Protocol, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import * as React from 'react';
import { Fragment } from 'react';

import featureStyles from '../../styles/components/features.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Host } from '../host';
import { GlobalContext } from '../interfaces/plugin';
import * as util from '../util';
import { Icon } from './icon';
import { analyzeBlockPath, getBlockImpl } from '../protocol';


export interface BlockInspectorProps {
  blockPath: ProtocolBlockPath | null;
  host: Host;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
}

export interface BlockInspectorState {

}

export class BlockInspector extends React.Component<BlockInspectorProps, BlockInspectorState> {
  private pool = new util.Pool();

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

    let context: GlobalContext = {
      host: this.props.host,
      pool: this.pool
    };

    let blockAnalysis = analyzeBlockPath(this.props.protocol, null, this.props.blockPath, context);

    let ancestorGroups = blockAnalysis.groups.slice(0, -1);
    let leafGroup = blockAnalysis.groups.at(-1);

    let leafBlock = blockAnalysis.pairs.at(-1).block;
    let leafBlockImpl = getBlockImpl(leafBlock, context);

    // console.log(blockAnalysis);

    return (
      <div className={util.formatClass(spotlightStyles.root, spotlightStyles.contents)}>
        {(ancestorGroups.length > 0) && (
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
          </div>
        )}
        <div className={spotlightStyles.header}>
          <h2 className={spotlightStyles.title}>{leafGroup.name ?? <i>{leafBlockImpl.getLabel?.(leafBlock) ?? 'Untitled'}</i>}</h2>
        </div>

        {blockAnalysis.isLeafBlockTerminal && (
          <div className={util.formatClass(featureStyles.list, featureStyles.group)}>
            {leafBlockImpl.createEntries?.(leafBlock, null, context).map((entry) => (
              entry.features.map((feature, featureIndex) => (
                <div className={util.formatClass(featureStyles.entry, featureStyles.entryAccent)} key={featureIndex}>
                  <Icon name={feature.icon} className={featureStyles.icon} />
                  <div className={featureStyles.body}>
                    {feature.description && <div className={featureStyles.description}>{feature.description}</div>}
                    <div className={featureStyles.label}>{feature.label}</div>
                  </div>
                </div>
              ))
            ))}
          </div>
        )}

        <div className={util.formatClass(featureStyles.list, featureStyles.group)}>
          {blockAnalysis.groups.slice().reverse().map((group) =>
            group.pairs.slice().reverse().map(({ block }) => {
              let blockImpl = getBlockImpl(block, context);
              return blockImpl.createEntries?.(block, null, context).map((entry) => (
                entry.features.map((feature, featureIndex) => (
                  <div className={featureStyles.entry} key={featureIndex}>
                    <Icon name={feature.icon} className={featureStyles.icon} />
                    <div className={featureStyles.body}>
                      {feature.description && <div className={featureStyles.description}>{feature.description}</div>}
                      <div className={featureStyles.label}>{feature.label}</div>
                    </div>
                    {/* <Icon name="power_off" className={featureStyles.errorIcon} />
                <button type="button" className={featureStyles.action}>
                  <Icon name="expand_more" />
                </button> */}
                  </div>
                ))
              ))
            })
          )}
        </div>
      </div>
    );
  }
}
