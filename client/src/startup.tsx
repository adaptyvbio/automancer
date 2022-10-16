/// <reference path="types.d.ts" />

import '@fontsource/space-mono/latin-400.css';
import * as React from 'react';

import { HostCreator } from './startup/host-creator';
import type { HostId } from './backends/common';
import * as util from './util';
import { type HostSettings, type HostSettingsRecord, formatHostSettings } from './host';
import { ContextMenuArea } from './components/context-menu-area';
import { MenuDef } from './components/context-menu';

import logoUrl from '../static/logo.jpeg';


interface StartupProps {
  defaultSettingsId: string | null;
  hostSettings: HostSettingsRecord;

  createHostSettings(options: { settings: HostSettings; }): void;
  deleteHostSettings(settingsId: string): void;
  launchHost(settingsId: string): void;
  setDefaultHostSettings(settingsId: string | null): void;
  revealHostSettingsDirectory?(settingsId: string): void;
  revealHostLogsDirectory?(settingsId: string): void;
}

interface StartupState {
  fullDisplay: boolean;
  hostCreatorIndex: number;
  hostCreatorOpen: boolean;
  hostCreatorVisible: boolean;
}

export class Startup extends React.Component<StartupProps, StartupState> {
  controller = new AbortController();

  constructor(props: StartupProps) {
    super(props);

    this.state = {
      fullDisplay: false,
      hostCreatorIndex: 0,
      hostCreatorOpen: false,
      hostCreatorVisible: false
    };
  }

  componentDidMount() {
    // debug
    // this.props.launchHost('a067b394-4f75-426e-b92b-7a0aa65cbf71');

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Alt') {
        this.setState({ fullDisplay: true });
      }
    }, { signal: this.controller.signal });

    document.addEventListener('keyup', (event) => {
      if ((event.key === 'Alt') && this.state.fullDisplay) {
        this.setState({ fullDisplay: false });
      }
    }, { signal: this.controller.signal });

    window.addEventListener('blur', () => {
      if (this.state.fullDisplay) {
        this.setState({ fullDisplay: false });
      }
    }, { signal: this.controller.signal });
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  resetHostCreator() {
    this.setState((state) => ({
      hostCreatorIndex: (state.hostCreatorIndex + 1),
      hostCreatorOpen: false,
      hostCreatorVisible: false
    }));
  }

  render() {
    return (
      <div className="startup-container">
        <div className={util.formatClass('startup-root', { '_transitioning': this.state.hostCreatorOpen })}>
          <div className="startup-editor-root">
            <div className="startup-editor-indicator" onTransitionEnd={(event) => {
              if ((event.currentTarget === event.target) && this.state.hostCreatorOpen) {
                this.setState({ hostCreatorVisible: true });
              }
            }} />
            <div className="startup-editor-holder">
              {this.state.hostCreatorVisible && (
                <HostCreator
                  onCancel={() => {
                    this.resetHostCreator();
                  }}
                  onDone={({ settings }) => {
                    this.resetHostCreator();
                    this.props.createHostSettings({ settings });
                  }}
                  key={this.state.hostCreatorIndex} />
              )}
            </div>
          </div>

          <div className="startup-home">
            <div className="startup-left-root">
              <div className="startup-left-dragregion" />
              <div className="startup-left-contents">
                <div className="startup-left-header">
                  <img src={new URL(logoUrl, import.meta.url).href} width="330" height="300" className="startup-left-logo" />
                  <div className="startup-left-title">PR–1</div>
                  {/* <div className="startup-left-title">Universal Lab Experience</div> */}
                </div>
                <div className="startup-left-bar">
                  <div>Version 3.0</div>
                  {/* {this.state.fullDisplay && (
                    <div>License no. <code>CF 59 AF 6E</code></div>
                  )} */}
                </div>
              </div>
            </div>
            <div className="startup-right-root">
              <div className="startup-right-entry-list">
                {Object.values(this.props.hostSettings).map((hostSettings) => {
                  let isDefault = (this.props.defaultSettingsId === hostSettings.id);
                  let isLocal = (hostSettings.backendOptions.type === 'internal');

                  return (
                    <ContextMenuArea
                      createMenu={(_event) => [
                        ...(isDefault
                          ? [{ id: 'default.unset', name: 'Unset as default' }]
                          : [{ id: 'default.set', name: 'Set as default' }]),
                        { id: 'divider', type: 'divider' },
                        ...(this.props.revealHostSettingsDirectory
                          ? [{ id: 'reveal-settings', name: 'Reveal settings in explorer', icon: 'folder_open', disabled: !isLocal }]
                          : []),
                        ...(this.props.revealHostLogsDirectory
                          ? [{ id: 'reveal-logs', name: 'Reveal logs in explorer', icon: 'folder_open', disabled: !isLocal }]
                          : []),
                        ...(this.props.revealHostLogsDirectory || this.props.revealHostSettingsDirectory
                          ? [{ id: 'divider2', type: 'divider' }]
                          : []),
                        { id: 'delete', name: 'Delete', icon: 'delete', disabled: hostSettings.builtin },
                      ] as MenuDef}
                      onSelect={(path) => {
                        switch (path.first()!) {
                          case 'delete':
                            this.props.deleteHostSettings(hostSettings.id);
                            break;
                          case 'default.set':
                            this.props.setDefaultHostSettings(hostSettings.id);
                            break;
                          case 'default.unset':
                            this.props.setDefaultHostSettings(null);
                            break;
                          case 'reveal-logs':
                            this.props.revealHostLogsDirectory!(hostSettings.id);
                            break;
                          case 'reveal-settings':
                            this.props.revealHostSettingsDirectory!(hostSettings.id);
                            break;
                        }
                      }}
                      key={hostSettings.id}>
                      <button type="button" className="startup-right-entry-item" onClick={() => {
                        this.props.launchHost(hostSettings.id);
                      }}>
                        <div className="startup-right-entry-title">{hostSettings.label ?? 'Untitled host'}{isDefault ? ' (default)' : ''}</div>
                        <div className="startup-right-entry-path">{formatHostSettings(hostSettings)}</div>
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" /></svg>
                      </button>
                    </ContextMenuArea>
                  );
                })}
              </div>
              <div className="startup-right-entry-list">
                <button type="button" className="startup-right-entry-item" onClick={() => {
                  this.setState({ hostCreatorOpen: true });
                }}>
                  <div className="startup-right-entry-title">New setup</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
