/// <reference path="types.d.ts" />

import '@fontsource/space-mono/latin-400.css';
import * as React from 'react';

import logoUrl from '../static/logo.jpeg';

import * as util from './util';
import { ContextMenuArea } from './components/context-menu-area';
import { MenuDef } from './components/context-menu';
import type { HostInfo, HostInfoId } from './interfaces/host';


export interface StartupProps {
  defaultHostInfoId: HostInfoId | null;
  hostInfos: HostInfo[];

  deleteHostInfo(hostInfoId: HostInfoId): void;
  launchHostInfo(hostInfoId: HostInfoId): void;
  renderHostCreator(options: { close(): void; }): React.ReactElement;
  revealHostInfoLogsDirectory?(hostInfoId: HostInfoId): void;
  revealHostInfoSettingsDirectory?(hostInfoId: HostInfoId): void;
  setDefaultHostInfo(hostInfoId: HostInfoId | null): void;
}

export interface StartupState {
  fullDisplay: boolean;
  hostCreatorOpen: boolean;
  hostCreatorVisible: boolean;
}

export class Startup extends React.Component<StartupProps, StartupState> {
  controller = new AbortController();
  pool = new util.Pool();

  constructor(props: StartupProps) {
    super(props);

    this.state = {
      fullDisplay: true,
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
              <div className="startup-editor-dragregion" />
              {this.state.hostCreatorVisible && (
                this.props.renderHostCreator({
                  close: () => void this.resetHostCreator()
                })
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
                {Object.values(this.props.hostInfos).map((hostInfo) => {
                  let isDefault = (this.props.defaultHostInfoId === hostInfo.id);

                  return (
                    <ContextMenuArea
                      createMenu={(_event) => [
                        { id: 'toggleDefault', name: 'Default', checked: isDefault },
                        { id: 'divider', type: 'divider' },
                        ...(this.props.revealHostInfoSettingsDirectory
                          ? [{ id: 'revealSettings', name: 'Reveal settings in explorer', icon: 'folder_open', disabled: !hostInfo.local }]
                          : []),
                        ...(this.props.revealHostInfoLogsDirectory
                          ? [{ id: 'revealLogs', name: 'Reveal logs in explorer', icon: 'folder_open', disabled: !hostInfo.local }]
                          : []),
                        ...(this.props.revealHostInfoLogsDirectory || this.props.revealHostInfoSettingsDirectory
                          ? [{ id: 'divider2', type: 'divider' }]
                          : []),
                        { id: 'delete', name: 'Delete', icon: 'delete' },
                      ] as MenuDef}
                      onSelect={(path) => {
                        switch (path.first()!) {
                          case 'delete':
                            this.props.deleteHostInfo(hostInfo.id);
                            break;
                          case 'revealLogs':
                            this.props.revealHostInfoLogsDirectory!(hostInfo.id);
                            break;
                          case 'revealSettings':
                            this.props.revealHostInfoSettingsDirectory!(hostInfo.id);
                            break;
                          case 'toggleDefault':
                            this.props.setDefaultHostInfo(isDefault ? null : hostInfo.id);
                        }
                      }}
                      key={hostInfo.id}>
                      <button type="button" className="startup-right-entry-item" onClick={() => {
                        this.props.launchHostInfo(hostInfo.id);
                      }}>
                        <div className="startup-right-entry-title">{hostInfo.label}{isDefault ? ' (default)' : ''}</div>
                        <div className="startup-right-entry-path">{hostInfo.description}</div>
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
