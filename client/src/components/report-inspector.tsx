import { ExperimentReportInfo, ExperimentReportStaticEntry, MasterBlockLocation, Protocol, ProtocolBlockPath } from 'pr1-shared';
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
import { formatAbsoluteTimePair, formatDurationTerm } from '../format';
import { TimeSensitive } from './time-sensitive';
import { getDateFromTerm } from '../term';


export function ReportInspector(props: {
  app: Application;
  blockPath: ProtocolBlockPath | null;
  host: Host;
  location: MasterBlockLocation | null;
  protocol: Protocol;
  reportInfo: ExperimentReportInfo;
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

  let blockAnalysis = analyzeBlockPath(props.protocol, props.location, props.blockPath, globalContext);

  let ancestorGroups = blockAnalysis.groups.slice(0, -1);
  let leafGroup = blockAnalysis.groups.at(-1)!;

  let leafPair = blockAnalysis.pairs.at(-1)!;
  let leafBlockImpl = getBlockImpl(leafPair.block, globalContext);

  console.log(props.reportInfo.rootStaticEntry);

  let staticEntry = props.blockPath.reduce<ExperimentReportStaticEntry | null>((staticEntry, childId) => (staticEntry?.children[childId] ?? null), props.reportInfo.rootStaticEntry);

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
          <div>A</div>
          <div>{JSON.stringify(staticEntry?.accesses)}</div>
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
    </div>
  );
}
