import { HostInfo, HostInfoId, Pool, Startup } from 'pr1';
import { HostSettingsId, HostSettingsRecord } from 'pr1-library';
import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import seqOrd from 'seq-ord';

import { NativeContextMenuProvider } from '../shared/context-menu';
import { HostCreator } from './host-creator';


export interface AppProps {

}

export interface AppState {
  defaultHostSettingsId: HostSettingsId | null;
  hostSettingsRecord: HostSettingsRecord | null;
}

export class App extends Component<AppProps, AppState> {
  pool = new Pool();

  constructor(props: AppProps) {
    super(props);

    this.state = {
      defaultHostSettingsId: null,
      hostSettingsRecord: null
    };
  }

  override componentDidMount() {
    this.pool.add(async () => {
      await this.queryHostSettings();

      await document.fonts.load('12px Material Symbols Rounded');
      await document.fonts.load('12px Material Symbols Sharp');
      await document.fonts.load('12px Space Mono');

      window.api.main.ready();
    });
  }

  async queryHostSettings() {
    let { defaultHostSettingsId, hostSettingsRecord } = await window.api.hostSettings.list();

    this.setState({
      defaultHostSettingsId,
      hostSettingsRecord
    });
  }

  override render() {
    if (!this.state.hostSettingsRecord) {
      return null;
    }

    return (
      <NativeContextMenuProvider>
        <Startup
          defaultHostInfoId={this.state.defaultHostSettingsId as string as HostInfoId}
          hostInfos={
            Object.values(this.state.hostSettingsRecord)
              .map((hostSettings): HostInfo => ({
                id: (hostSettings.id as string as HostInfoId),
                description: (hostSettings.options.type === 'tcp')
                  ? `${hostSettings.options.hostname}:${hostSettings.options.port}`
                  : 'Local',
                imageUrl: null,
                label: hostSettings.label,
                local: (hostSettings.options.type === 'local')
              }))
              .sort(seqOrd(function* (a, b, rules) {
                yield rules.text(a.label, b.label);
              }))
          }

          deleteHostInfo={(hostInfoId) => {
            this.pool.add(async () => {
              await window.api.hostSettings.delete({ hostSettingsId: (hostInfoId as string as HostSettingsId) });
              await this.queryHostSettings();
            });
          }}
          launchHostInfo={(hostInfoId) => {
            window.api.hostSettings.launchHost({ hostSettingsId: (hostInfoId as string as HostSettingsId) });
          }}
          renderHostCreator={({ close }) => (
            <HostCreator
              close={close}
              queryHostSettings={async () => void await this.queryHostSettings()} />
          )}
          revealHostInfoLogsDirectory={(hostInfoId) => {
            window.api.hostSettings.revealLogsDirectory({ hostSettingsId: (hostInfoId as string as HostSettingsId) });
          }}
          revealHostInfoSettingsDirectory={(hostInfoId) => {
            window.api.hostSettings.revealSettingsDirectory({ hostSettingsId: (hostInfoId as string as HostSettingsId) });
          }}
          setDefaultHostInfo={(hostInfoId) => {
            this.pool.add(async () => {
              await window.api.hostSettings.setDefault({ hostSettingsId: (hostInfoId as string as HostSettingsId) });
              await this.queryHostSettings();
            });
          }} />
      </NativeContextMenuProvider>
    );
  }
}


document.body.dataset['platform'] = window.api.platform;

let root = createRoot(document.getElementById('root')!);
root.render(<App />);
