import { Experiment, MasterBlockLocation, Protocol, ProtocolBlockPath, addTerms } from 'pr1-shared';
import { Component, Fragment } from 'react';

import featureStyles from '../../styles/components/features.module.scss';
import formStyles from '../../styles/components/form.module.scss';
import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Icon } from './icon';
import { Host } from '../host';
import { Button } from './button';
import { ErrorBoundary } from './error-boundary';
import { BlockContext, GlobalContext } from '../interfaces/plugin';
import { Pool } from '../util';
import { analyzeBlockPath, createBlockContext, getBlockImpl } from '../protocol';
import { FeatureEntry, FeatureList } from './features';
import { Application } from '../application';
import { formatAbsoluteTimePair, formatRemainingTime } from '../format';
import { TimeSensitive } from './time-sensitive';
import { getDateFromTerm } from '../term';


export interface ExecutionInspectorProps {
  activeBlockPaths: ProtocolBlockPath[];
  app: Application;
  blockPath: ProtocolBlockPath | null;
  experiment: Experiment;
  host: Host;
  location: MasterBlockLocation;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
}

export interface ExecutionInspectorState {

}

export class ExecutionInspector extends Component<ExecutionInspectorProps, ExecutionInspectorState> {
  pool = new Pool();

  constructor(props: ExecutionInspectorProps) {
    super(props);

    this.state = {
      selectedBlockPathIndex: 0
    };
  }

  override render() {
    if (!this.props.blockPath) {
      return (
        <div className={spotlightStyles.placeholder}>
          <p>Nothing selected</p>
        </div>
      );
    }

    let context: GlobalContext = {
      app: this.props.app,
      host: this.props.host,
      pool: this.pool
    };

    let blockAnalysis = analyzeBlockPath(this.props.protocol, this.props.location, this.props.blockPath, context);

    let ancestorGroups = blockAnalysis.groups.slice(0, -1);
    let leafGroup = blockAnalysis.groups.at(-1)!;

    let leafPair = blockAnalysis.pairs.at(-1)!;
    let leafBlockImpl = getBlockImpl(leafPair.block, context);
    let leafBlockContext = createBlockContext(this.props.blockPath, this.props.experiment.id, context);

    // console.log('*', blockAnalysis);

    return (
      <div className={spotlightStyles.root}>
        <div className={spotlightStyles.contents}>
          {(
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
            <h2 className={spotlightStyles.title}>{leafGroup.name ?? <i>{leafBlockImpl.getLabel?.(leafPair.block) ?? 'Untitled'}</i>}</h2>

            <div className={spotlightStyles.navigationRoot}>
              <button type="button" className={spotlightStyles.navigationButton} disabled={true}>
                <Icon name="chevron_left" className={spotlightStyles.navigationIcon} />
              </button>
              <button type="button" className={spotlightStyles.navigationButton} disabled={-1 !== (this.props.activeBlockPaths.length - 1)}>
                <Icon name="chevron_right" className={spotlightStyles.navigationIcon} />
              </button>
            </div>
          </div>

          <div className={spotlightStyles.timeinfo}>
            <TimeSensitive
              contents={() => {
                let now = Date.now();
                let terms = leafPair.terms!;

                let endDate = getDateFromTerm(terms.end, now);
                let startDate = getDateFromTerm(terms.start, now);

                return (
                  <>
                    {(endDate !== null)
                      ? <div>{formatRemainingTime(endDate - now)}</div>
                      : (terms.end.type === 'forever')
                        ? <div>&infin;</div>
                        : <div>Unknown time left</div>}
                    {(startDate !== null) && (
                      <div>{formatAbsoluteTimePair(startDate, endDate, { mode: 'directional' })}</div>
                    )}
                  </>
                );
              }}
              interval={30e3} />
          </div>

          {blockAnalysis.isLeafBlockTerminal && (
            <FeatureList features={leafBlockImpl.createFeatures!(leafPair.block, leafPair.location, context)} />
          )}

          {leafBlockImpl.Component && (
            <ErrorBoundary>
              <leafBlockImpl.Component
                block={leafPair.block}
                context={leafBlockContext}
                location={leafPair.location} />
            </ErrorBoundary>
          )}

          <div className={featureStyles.root}>
            {blockAnalysis.groups.slice().reverse().map((group) =>
              group.pairs.slice().reverse().map((pair, pairIndex) => {
                let blockImpl = getBlockImpl(pair.block, context);
                let blockPath = (pairIndex > 0)
                  ? group.path.slice(0, -pairIndex)
                  : group.path;
                let blockContext = createBlockContext(blockPath, this.props.experiment.id, context);

                if (!blockImpl.createFeatures) {
                  return null;
                }

                let actions = (blockImpl.createActions?.(pair.block, pair.location, blockContext) ?? []);

                return (
                  <FeatureEntry
                    actions={[
                      ...actions,
                      { id: '_halt',
                        icon: 'skip_next' }
                    ]}
                    detail={blockImpl.Component && (() => {
                      let Component = blockImpl.Component!;

                      return (
                        <Component
                          block={pair.block}
                          context={blockContext}
                          location={pair.location} />
                      );
                    })}
                    features={blockImpl.createFeatures(pair.block, pair.location, context)}
                    onAction={(actionId) => {
                      if (actionId === '_halt') {
                        this.pool.add(async () => {
                          await this.props.host.client.request({
                            type: 'sendMessageToActiveBlock',
                            experimentId: this.props.experiment.id,
                            path: blockPath,
                            message: { type: 'halt' }
                          });
                        });
                      } else {
                        actions.find((action) => (action.id === actionId))?.onTrigger();
                      }
                    }}
                    key={blockPath.at(-1) ?? -1} />
                );
              })
            )}
          </div>
        </div>
        <div className={spotlightStyles.footerRoot}>
          <div className={spotlightStyles.footerActions}>
            {leafBlockImpl.createCommands?.(leafPair.block, leafPair.location, leafBlockContext).map((command) => (
              <Button
                onClick={() => command.onTrigger()}
                shortcut={command.shortcut ?? null}
                key={command.id}>
                {command.label}
              </Button>
            ))}
          </div>
          <div className={spotlightStyles.footerActions}>
            <Button shortcut="Alt+ArrowRight" onClick={() => {
              this.pool.add(async () => {
                await leafBlockContext.sendMessage({ type: 'halt' });
              });
            }}>Skip</Button>
          </div>
          {/* <div>
            <div className={spotlightStyles.footerStatus}>Pausing</div>
          </div> */}
        </div>
      </div>
    );
  }
}
