import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';

import formStyles from '../../styles/components/form.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';
import { Protocol, ProtocolBlockPath } from '../interfaces/protocol';
import { Host } from '../host';
import { getBlockExplicitLabel, getBlockProcess } from '../unit';
import { FeatureGroup, FeatureList } from './features';


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
    let family = [targetBlock];

    for (let key of this.props.blockPath) {
      let unit = this.props.host.units[targetBlock.namespace];
      targetBlock = unit.getChildBlock!(targetBlock, key);
      family.push(targetBlock);
    }

    let familyLabels = family.map((block) => {
      let unit = this.props.host.units[block.namespace];
      return getBlockExplicitLabel(block, this.props.host)
        ?? unit.getBlockDefaultLabel?.(block)
        ?? (block.namespace !== 'segment' ? 'Block' : null);
    });

    let process = getBlockProcess(targetBlock, this.props.host);
    let processUnit = process && this.props.host.units[process.namespace];


    return (
      <div className={util.formatClass(formStyles.main2, spotlightStyles.root)}>
        <div className={spotlightStyles.breadcrumbRoot}>
          {family.slice(0, -1).map((block, index, arr) => {
            let label = familyLabels[index];
            let last = index === (arr.length - 1);

            return (
              <React.Fragment key={index}>
                <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                  this.props.selectBlock(this.props.blockPath!.slice(0, index));
                }}>{label}</button>
                {!last && <Icon name="chevron_right" className={spotlightStyles.breadcrumbIcon} />}
              </React.Fragment>
            );
          })}
        </div>
        <div className={spotlightStyles.header}>
          <h2 className={spotlightStyles.title}>{familyLabels.at(-1) ?? <i>Untitled step</i>}</h2>
          {/* <div className={spotlightStyles.navigationRoot}>
            <button type="button" className={spotlightStyles.navigationButton} disabled>
              <Icon name="chevron_left" className={spotlightStyles.navigationIcon} />
            </button>
            <button type="button" className={spotlightStyles.navigationButton}>
              <Icon name="chevron_right" className={spotlightStyles.navigationIcon} />
            </button>
          </div> */}
        </div>

        {(process && processUnit) && (
          <FeatureList list={[processUnit.createProcessFeatures!(process.data, {
            host: this.props.host
          })]} />
        )}

        <FeatureList list={Array.from(family).reverse().map((block) => {
          return Object.values(this.props.host.units).flatMap((unit) => {
            return unit?.createStateFeatures?.(block.state, { host: this.props.host }) ?? [];
          });
        }).filter((x) => x.length > 0)} />
      </div>
    );
  }
}
