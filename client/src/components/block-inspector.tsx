import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';
import { Protocol, ProtocolBlockPath, ProtocolState } from '../interfaces/protocol';
import { Host } from '../host';
import { getBlockExplicitLabel, getBlockLabel, getSegmentBlockProcessData } from '../unit';
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
    let family = [targetBlock];

    for (let key of this.props.blockPath) {
      let unit = this.props.host.units[targetBlock.namespace];
      targetBlock = unit.getChildBlock!(targetBlock, key);
      family.push(targetBlock);
    }

    let familyLabels = family.map((block) => {
      return getBlockLabel(block, null, this.props.host);
    });

    let process = getSegmentBlockProcessData(targetBlock, this.props.host);
    let processUnit = process && this.props.host.units[process.namespace];


    return (
      <div className={util.formatClass(spotlightStyles.root, spotlightStyles.contents)}>
        {(family.length > 1) && (
          <div className={spotlightStyles.breadcrumbRoot}>
            {family.slice(0, -1).map((_block, index, arr) => {
              let label = familyLabels[index];
              let last = index === (arr.length - 1);

              return (
                <React.Fragment key={index}>
                  <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                    this.props.selectBlock(this.props.blockPath!.slice(0, index));
                  }}>{renderLabel(label)}</button>
                  {!last && <Icon name="chevron_right" className={spotlightStyles.breadcrumbIcon} />}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <div className={spotlightStyles.header}>
          <h2 className={spotlightStyles.title}>{renderLabel(familyLabels.at(-1))}</h2>
        </div>

        {(process && processUnit) && (
          <SimpleFeatureList list={[processUnit.createProcessFeatures!(process.data, {
            host: this.props.host
          }).map((feature) => ({ ...feature, accent: true }))]} />
        )}

        <SimpleFeatureList list={family.flatMap((block, index) => {
          return block.state
            ? [Object.values(this.props.host.units).flatMap((unit) => {
              return unit?.createStateFeatures?.(
                block.state!,
                (family
                  .slice(index + 1)
                  .map((b) => b.state)
                  .filter((s) => s)) as ProtocolState[],
                null,
                { host: this.props.host }
              ) ?? [];
            })]
            : [];
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
