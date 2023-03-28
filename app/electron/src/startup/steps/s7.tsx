//* Search for remote hosts

import { Pool, React, Selector } from 'pr1';
import { Depromisify, HostIdentifier } from 'pr1-shared';

import { HostCreatorData, HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 7;

  previousStepData: HostCreatorData;
  selectedHostIdentifier: HostIdentifier | null;
}

export interface State {
  remoteHostInfos: Depromisify<ReturnType<typeof window.api.hostSettings.queryRemoteHosts>> | null;
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

      if (this.props.data.selectedHostIdentifier && !remoteHostInfos.some((hostInfo) => hostInfo.identifier === this.props.data.selectedHostIdentifier)) {
        this.props.setData({
          selectedHostIdentifier: null
        });
      }
    });
  }

  override componentDidMount() {
    this.queryRemoteHostInfos();
  }

  override componentWillUnmount() {
    this.controller.abort();
  }

  override render() {
    return (
      <form className="startup-editor-contents" onSubmit={(event) => {
        event.preventDefault();

        this.props.setData({
          stepIndex: 1,

          options: this.state.remoteHostInfos!.find((hostInfo) => {
            let bridge = hostInfo.bridges[0];
            return bridge.options.identifier === this.props.data.selectedHostIdentifier;
          })!.bridges[0].options,
          previousStepData: this.props.data
        })
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

                    switch (bridge.type) {
                      case 'tcp':
                        description = `${bridge.options.hostname}:${bridge.options.port} (TCP with TLS)`;
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
              this.props.setData(this.props.data.previousStepData);
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
