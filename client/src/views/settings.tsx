import * as React from 'react';
import seqOrd from 'seq-ord';

import { Application, Route } from '../application';
import { Icon } from '../components/icon';
import * as Form from '../components/standard-form';
import { TitleBar } from '../components/title-bar';
import { Host } from '../host';
import { UnitInfo, UnitNamespace } from '../units';
import * as util from '../util';

import viewStyles from '../../styles/components/view.module.scss';


export interface ViewSettingsProps {
  app: Application;
  host: Host;
  setRoute(route: Route): void;
}

export interface ViewSettingsState {
  selectedUnitNamespace: UnitNamespace | null;
}

export class ViewSettings extends React.Component<ViewSettingsProps, ViewSettingsState> {
  constructor(props: ViewSettingsProps) {
    super(props);

    this.state = {
      selectedUnitNamespace: null
    };
  }

  render() {
    let unitsInfo = this.props.host.state.info.units;
    let selectedUnitInfo = this.state.selectedUnitNamespace && unitsInfo[this.state.selectedUnitNamespace];

    return (
      <main className={viewStyles.root}>
        <TitleBar title="Modules" />
        <div className={util.formatClass(viewStyles.contents, viewStyles.legacy, 'slayout')}>
          <div className="header header--1">
            <h1>Modules</h1>
          </div>

          <div className="usettings-root">
            <div className="usettings-list">
              {Object.values(unitsInfo)
                .sort(seqOrd(function* (a, b, rules) {
                  if (a.metadata.title && b.metadata.title) {
                    yield rules.text(a.metadata.title, b.metadata.title);
                  }
                }))
                .map((unitInfo) => (
                  <UnitInfoEntry
                    unitInfo={unitInfo}
                    onClick={() => {
                      this.setState({ selectedUnitNamespace: unitInfo.namespace });
                    }}
                    selected={selectedUnitInfo === unitInfo}
                    key={unitInfo.namespace} />
                ))}
            </div>
            {selectedUnitInfo && (
              <div className="usettings-panel upanel-root">
                <div className="upanel-header">
                  <h2 className="upanel-title">{selectedUnitInfo.metadata.title ?? selectedUnitInfo.namespace}</h2>
                  <label className="upanel-checkbox">
                    <input type="checkbox" checked={selectedUnitInfo.enabled} readOnly />
                    <div>Enabled</div>
                  </label>
                </div>

                <div className="upanel-info">
                  {selectedUnitInfo.metadata.description && <p className="upanel-description">{selectedUnitInfo.metadata.description}</p>}
                  <dl className="upanel-data">
                    <dt>Namespace</dt>
                    <dd><code>{selectedUnitInfo.namespace}</code></dd>
                    {/* <dt>Author</dt>
                    <dd>{selectedUnitInfo.metadata.author ?? 'Unknown'}</dd>
                    <dt>License</dt>
                    <dd>{selectedUnitInfo.metadata.license ?? 'Unknown'}</dd> */}
                    <dt>Version</dt>
                    <dd>{selectedUnitInfo.metadata.version ?? 'Unknown'}</dd>
                  </dl>
                </div>

                {/* <div className="upanel-settings">
                  <h3>Settings</h3>
                  <div className="upanel-status">This module's settings can only be edited in the setup configuration file.</div>
                </div> */}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }
}


function UnitInfoEntry(props: {
  onClick?(): void;
  selected: unknown;
  unitInfo: UnitInfo;
}) {
  let unitInfo = props.unitInfo;

  let icon = (() => {
    let metadataIcon = unitInfo.metadata.icon ?? { kind: 'icon', value: 'mic' };

    switch (metadataIcon.kind) {
      case 'bitmap': return (
        <div className="usettings-icon">
          <div className="usettings-icon-mask" style={{ WebkitMaskImage: `url(${metadataIcon.value})` }} />
        </div>
      );

      case 'icon': return (
        <div className="usettings-icon">
          <Icon name={metadataIcon.value} />
        </div>
      );

      case 'svg': return (
        <div className="usettings-icon" dangerouslySetInnerHTML={{ __html: metadataIcon.value }} />
      );
    }
  })();

  return (
    <button
      type="button"
      className={util.formatClass('usettings-entry', { '_selected': props.selected })}
      onClick={props.onClick}
      style={{ '--angle': getAngle(hash(unitInfo.namespace)) } as React.CSSProperties}
      key={unitInfo.namespace}>
      {icon}
      <div className="usettings-title">{unitInfo.metadata.title ?? unitInfo.namespace}</div>
      {unitInfo.metadata.version && <div className="usettings-subtitle">{unitInfo.metadata.version}</div>}
    </button>
  );
}


function getAngle(input: number): string {
  return `${Math.round((Math.abs(input) % 360) / 360 * 6) / 6 * 360}deg`;
}

function hash(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index++) {
    let ch = input.charCodeAt(index);
    hash = (((hash << 5) - hash) + ch) | 0;
  }

  return hash;
}
