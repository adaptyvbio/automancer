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
import { Application } from '../application';
import { formatAbsoluteTimePair, formatDuration } from '../format';
import { TimeSensitive } from './time-sensitive';


export function BlockInspector(props: {
  app: Application;
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
    app: props.app,
    host: props.host,
    pool
  };

  let blockAnalysis = analyzeBlockPath(props.protocol, null, props.blockPath, globalContext);

  let ancestorGroups = blockAnalysis.groups.slice(0, -1);
  let leafGroup = blockAnalysis.groups.at(-1)!;

  let leafPair = blockAnalysis.pairs.at(-1)!;
  let leafBlockImpl = getBlockImpl(leafPair.block, globalContext);

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
          <h2 className={spotlightStyles.title}>{leafGroup.name ?? <i>{leafBlockImpl.getLabel?.(leafPair.block) ?? 'Untitled'}</i>}</h2>
        </div>

        <div className={spotlightStyles.timeinfo}>
          <TimeSensitive
            contents={() => {
              let now = Date.now();

              return (
                <>
                  <div>{formatDuration(leafPair.duration * 1000)}</div>
                  <div>{formatAbsoluteTimePair(now + leafPair.startTime * 1000, now + leafPair.endTime * 1000, { mode: 'directional' })}</div>
                </>
              );
            }}
            interval={30e3} />
        </div>

        {blockAnalysis.isLeafBlockTerminal && (
          <FeatureList features={leafBlockImpl.createFeatures!(leafPair.block, null, globalContext)} />
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
