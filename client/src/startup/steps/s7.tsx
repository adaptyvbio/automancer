import * as React from 'react';

import { Pool, usePool } from '../../util';
import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';
import { Selector } from '../selector';


export interface Data extends HostCreatorStepData {
  stepIndex: 7;

  selectedHostIdentifier: string | null;
}

export interface State {
  remoteHostInfos: AdvertisedHostInfo[] | null;
}

export class Component extends React.Component<HostCreatorStepProps<Data>, State> {
  controller = new AbortController();
  pool = new Pool();

  constructor(props: HostCreatorStepProps<Data>) {
    super(props);

    this.state = {
      remoteHostInfos: null
    };
  }

  queryRemoteHostInfos() {
    this.pool.add(async () => {
      let remoteHostInfos = await window.api.hostSettings.queryRemoteHosts();

      if (this.controller.signal.aborted) {
        return;
      }

      this.setState({ remoteHostInfos });

      if (this.props.data.selectedHostIdentifier && !remoteHostInfos.some((hostInfo) => hostInfo.identifier === props.data.selectedHostIdentifier)) {
        this.props.setData({
          selectedHostIdentifier: null
        });
      }
    });
  }

  componentDidMount() {
    this.queryRemoteHostInfos();
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  render() {
    return (
      <form className="startup-editor-contents" onSubmit={(event) => {
        event.preventDefault();
      }}>
        <div className="startup-editor-inner">
          <header className="startup-editor-header">
            <div className="startup-editor-subtitle">New setup</div>
            <h2>Search for setups on this network</h2>
          </header>

          {this.state.remoteHostInfos
            ? (this.state.remoteHostInfos.length > 0)
              ? (
                <Selector
                  entries={this.state.remoteHostInfos.map((hostInfo) => {
                    let bridge = hostInfo.bridges[0];
                    let description: string;

                    switch (bridge.options.type) {
                      case 'inet':
                        description = `${bridge.options.hostname}:${bridge.options.port}`;
                        break;
                      default:
                        description = 'Unknown';
                    }

                    return {
                      id: hostInfo.identifier,
                      name: hostInfo.description,
                      description,
                      icon: 'router'
                    };
                  })}
                  onSelect={(selectedHostIdentifier) => void this.props.setData({ selectedHostIdentifier })}
                  selectedEntryId={this.props.data.selectedHostIdentifier} />
              )
              : (
                <div className="startup-editor-status">
                  <p>No remote setup found.</p>
                </div>
              )
            : (
              <div className="startup-editor-status">
                <p>Scanning...</p>
              </div>
            )}
        </div>

        <div className="startup-editor-action-root">
          <div className="startup-editor-action-list">
            <button type="button" className="startup-editor-action-item" onClick={() => {
              this.props.setData({
                stepIndex: 0,

                address: '',
                port: ''
              });
            }}>Back</button>
          </div>
          <div className="startup-editor-action-list">
            <button type="button" className="startup-editor-action-item" onClick={() => {
              this.queryRemoteHostInfos();
              this.setState({ remoteHostInfos: null });
            }} disabled={!this.state.remoteHostInfos}>Reload</button>
            <button type="submit" className="startup-editor-action-item" disabled={!(this.state.remoteHostInfos && this.props.data.selectedHostIdentifier)}>Next</button>
          </div>
        </div>
      </form>
    );
  }
}
