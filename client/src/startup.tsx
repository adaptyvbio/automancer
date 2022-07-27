import '@fontsource/space-mono';
import * as React from 'react';

import { HostCreator } from './startup/host-creator';
import type { HostId } from './backends/common';
import * as util from './util';
import { type HostSettings, type HostSettingsRecord, formatHostSettings } from './host';
import { ContextMenuArea } from './components/context-menu-area';
import { BaseBackend } from './backends/base';


interface StartupProps {
  createHostSettings(options: { backend: BaseBackend; settings: HostSettings; }): void;
  deleteHostSettings(settingsId: string): void;
  launchDefaultHost?(): void;
  launchHost(settingsId: string): void;
  hostSettings: HostSettingsRecord;
}

interface StartupState {
  hostCreatorIndex: number;
  hostCreatorOpen: boolean;
}

export class Startup extends React.Component<StartupProps, StartupState> {
  constructor(props: StartupProps) {
    super(props);

    this.state = {
      hostCreatorIndex: 0,
      hostCreatorOpen: false
    };
  }

  render() {
    return (
      <div className="startup-container">
        <div className={util.formatClass('startup-root', { '_transitioning': this.state.hostCreatorOpen })}>
          <div className="startup-editor-root">
            <div className="startup-editor-holder">
              {(
                <HostCreator
                  onCancel={() => {
                    this.setState((state) => ({
                      hostCreatorIndex: (state.hostCreatorIndex + 1),
                      hostCreatorOpen: false
                    }));
                  }}
                  onDone={({ backend, settings }) => {
                    this.setState((state) => ({
                      hostCreatorIndex: (state.hostCreatorIndex + 1),
                      hostCreatorOpen: false
                    }));

                    this.props.createHostSettings({ backend, settings });
                  }}
                  key={this.state.hostCreatorIndex} />
              )}
            </div>
          </div>

          <div className="startup-home">
            <div className="startup-left-root">
              <div className="startup-left-header">
                <div className="startup-left-logo">
                  <div className="startup-left-logo-inner"></div>
                </div>
                <div className="startup-left-title">PR–1</div>
              </div>
              <div className="startup-left-bar">
                <div>Version 1.6 (110)</div>
                {this.props.launchDefaultHost && (
                  <button type="button" className="startup-left-action" onClick={() => {
                    this.props.launchDefaultHost!();
                  }}>
                    <div>Use local host</div>
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" /></svg>
                  </button>
                )}
              </div>
            </div>
            <div className="startup-right-root">
              <div className="startup-right-entry-list">
                {Object.values(this.props.hostSettings).map((hostSettings) => (
                  <ContextMenuArea
                    createMenu={(_event) => [
                      { id: 'delete', name: 'Delete', icon: 'delete', disabled: hostSettings.builtin }
                    ]}
                    onSelect={(path) => {
                      if (path.first()! === 'delete') {
                        this.props.deleteHostSettings(hostSettings.id);
                      }
                    }}
                    key={hostSettings.id}>
                    <button type="button" className="startup-right-entry-item" onClick={() => {
                      this.props.launchHost(hostSettings.id);
                    }}>
                      <div className="startup-right-entry-title">{hostSettings.label ?? 'Untitled host'}</div>
                      <div className="startup-right-entry-path">{formatHostSettings(hostSettings)}</div>
                      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" /></svg>
                    </button>
                  </ContextMenuArea>
                ))}
              </div>
              <div className="startup-right-entry-list">
                <button type="button" className="startup-right-entry-item" onClick={() => {
                  this.setState({ hostCreatorOpen: true });
                }}>
                  <div className="startup-right-entry-title">Connect to new host</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
