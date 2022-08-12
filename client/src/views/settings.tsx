import * as React from 'react';

import { Application, Route } from '../application';
import { Host } from '../host';


export interface ViewSettingsProps {
  app: Application;
  host: Host;
  setRoute(route: Route): void;
}

export interface ViewSettingsState {

}

export class ViewSettings extends React.Component<ViewSettingsProps, ViewSettingsState> {
  render() {
    return (
      <main>
        <div className="header header--1">
          <h1>Settings</h1>
        </div>

        <div className="header header--2">
          <h2>Units</h2>
        </div>

        <div className="usettings-list">
          {Object.values(this.props.host.state.info.units).map((unitInfo) => (
            <div className="usettings-entry">
              <div className="usettings-title">{unitInfo.metadata.title}</div>
              <div className="usettings-description">{unitInfo.metadata.description}</div>
            </div>
          ))}
        </div>
      </main>
    );
  }
}
