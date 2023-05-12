import { Protocol, ProtocolBlockPath } from 'pr1-shared';
import { Fragment, ReactNode } from 'react';

import featureStyles from '../../styles/components/features.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Host } from '../host';
import { GlobalContext } from '../interfaces/plugin';
import { analyzeBlockPath, getBlockImpl } from '../protocol';
import { usePool } from '../util';
import { FeatureEntry, FeatureList } from './features';
import { Icon } from './icon';


export function BlockInspector(props: {
  blockPath: ProtocolBlockPath | null;
  footer?: [ReactNode, ReactNode] | null;
  host: Host;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
}) {
  let pool = usePool();

  if (!props.blockPath) {
    return (
      <div className={spotlightStyles.placeholder}>
        <p>Nothing selected</p>
      </div>
    );
  }

  let globalContext: GlobalContext = {
    host: props.host,
    pool
  };

  let blockAnalysis = analyzeBlockPath(props.protocol, null, props.blockPath, globalContext);

  let ancestorGroups = blockAnalysis.groups.slice(0, -1);
  let leafGroup = blockAnalysis.groups.at(-1);

  let leafBlock = blockAnalysis.pairs.at(-1).block;
  let leafBlockImpl = getBlockImpl(leafBlock, globalContext);

  return (
    <div className={spotlightStyles.root}>
      <div className={spotlightStyles.contents}>
        {(ancestorGroups.length > 0) && (
          <div className={spotlightStyles.breadcrumbRoot}>
            {ancestorGroups.map((group, groupIndex, arr) => {
              let last = groupIndex === (arr.length - 1);

              return (
                <Fragment key={groupIndex}>
                  <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                    props.selectBlock(group.path);
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
          <FeatureList features={leafBlockImpl.createFeatures!(leafBlock, null, globalContext)} />
        )}

        <div className={featureStyles.root}>
          {blockAnalysis.groups.slice().reverse().map((group) =>
            group.pairs.slice().reverse().map((pair, pairIndex) => {
              let blockImpl = getBlockImpl(pair.block, globalContext);

              if (!blockImpl.createFeatures) {
                return null;
              }

              return (
                <FeatureEntry
                  features={blockImpl.createFeatures(pair.block, pair.location, globalContext)}
                  key={pairIndex} />
              );
            })
          )}
        </div>
      </div>
      {props.footer && (
        <div className={spotlightStyles.footerRoot}>
          <div className={spotlightStyles.footerActions}>
            {props.footer[0]}
          </div>
          <div className={spotlightStyles.footerActions}>
            {props.footer[1]}
          </div>
        </div>
      )}
    </div>
  );
}
