import { Experiment, ExperimentReportEvents, ExperimentReportInfo, ExperimentReportStaticEntry, MasterBlockLocation, Protocol, ProtocolBlockPath } from 'pr1-shared';
import { Fragment, ReactNode, useEffect, useState } from 'react';

import featureStyles from '../../styles/components/features.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Host } from '../host';
import { GlobalContext } from '../interfaces/plugin';
import { analyzeBlockPath, getBlockImpl } from '../protocol';
import { usePool } from '../util';
import { FeatureEntry, FeatureList } from './features';
import { Icon } from './icon';
import { Application } from '../application';
import { formatAbsoluteTime, formatAbsoluteTimePair, formatDurationTerm } from '../format';
import { TimeSensitive } from './time-sensitive';
import { getDateFromTerm } from '../term';
import { formatRelativeDate } from '../format';
import { formatRelativeTime } from '../format';
import { StaticSelect } from './static-select';


export function ReportInspector(props: {
  app: Application;
  blockPath: ProtocolBlockPath | null;
  host: Host;
  experiment: Experiment;
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

  let [events, setEvents] = useState<ExperimentReportEvents | null>(null);
  let [selectedOccurenceIndex, setSelectedOccurenceIndex] = useState<number | null>(null);

  let globalContext: GlobalContext = {
    app: props.app,
    host: props.host,
    pool
  };

  let staticEntry = props.blockPath.reduce<ExperimentReportStaticEntry | null>((staticEntry, childId) => (staticEntry?.children[childId] ?? null), props.reportInfo.rootStaticEntry);

  useEffect(() => {
    pool.add(async () => {
      let events = await props.host.client.request({
        type: 'getExperimentReportEvents',
        eventIndices: (staticEntry?.accesses ?? []).flat(),
        experimentId: props.experiment.id
      });

      setEvents(events);
    });
  }, []);

  let location = (selectedOccurenceIndex !== null)
    ? events![staticEntry!.accesses[selectedOccurenceIndex][0]].location
    : null;

  let blockAnalysis = analyzeBlockPath(props.protocol, location, props.blockPath, globalContext);

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
          <div>Occurences</div>
          <div>
            {events && staticEntry && (
              <StaticSelect
                options={[
                  { id: null, label: 'General form' },
                  ...staticEntry.accesses.map((access, accessIndex) => {
                    let startEvent = events![access[0]];
                    let endEvent = events![access[1]];

                    return {
                      id: accessIndex,
                      label: `${new Date(startEvent.date).toLocaleString()} ${new Date(endEvent.date).toLocaleString()}`
                    };
                  })
                ]}
                selectedOptionId={selectedOccurenceIndex}
                selectOption={(occurenceIndex) => void setSelectedOccurenceIndex(occurenceIndex)} />
            )}
          </div>
          {/* <div>{JSON.stringify(staticEntry?.accesses)}</div> */}
        </div>

        {blockAnalysis.isLeafBlockTerminal && (
          <FeatureList features={leafBlockImpl.createFeatures!(leafPair.block, leafPair.location, globalContext)} />
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
