import { HostInfo, HostInfoId, Pool, React, ReactDOM, Startup } from 'pr1';
import seqOrd from 'seq-ord';

import { HostCreator } from './host-creator';
import { NativeContextMenuProvider } from '../shared/context-menu';
import { HostSettingsId, HostSettingsRecord } from '../interfaces';


export interface AppProps {

}

export interface AppState {
  defaultHostSettingsId: HostSettingsId | null;
  hostSettings: HostSettingsRecord | null;
}

export class App extends React.Component<AppProps, AppState> {
  pool = new Pool();

  constructor(props: AppProps) {
    super(props);

    this.state = {
      defaultHostSettingsId: null,
      hostSettings: null
    };
  }

  override componentDidMount() {
    this.pool.add(async () => {
      await this.query();
      await window.api.ready();
    });
  }

  async query() {
    let { defaultHostSettingsId, hostSettings } = await window.api.hostSettings.query();

    this.setState({
      defaultHostSettingsId,
      hostSettings
    });
  }

  override render() {
    if (!this.state.hostSettings) {
      return null;
    }

    return (
      <NativeContextMenuProvider>
        <Startup
          defaultHostInfoId={this.state.defaultHostSettingsId as string as HostInfoId}
          hostInfos={
            Object.values(this.state.hostSettings)
              .map((hostSettings): HostInfo => ({
                id: (hostSettings.id as string as HostInfoId),
                description: '–',
                imageUrl: null,
                label: hostSettings.label,
                local: (hostSettings.type !== 'local')
              }))
              .sort(seqOrd(function* (a, b, rules) {
                yield rules.text(a.label, b.label);
              }))
          }

          deleteHostInfo={(hostInfoId) => {
            this.pool.add(async () => {
              await window.api.hostSettings.delete({ hostSettingsId: hostInfoId });
              await this.query();
            });
          }}
          launchHostInfo={(hostInfoId) => {
            window.api.launchHost({ hostSettingsId: hostInfoId });
          }}
          renderHostCreator={({ close }) => (
            <HostCreator
              close={close}
              update={async () => void await this.query()} />
          )}
          revealHostInfoLogsDirectory={(hostInfoId) => {
            window.api.hostSettings.revealLogsDirectory({ hostSettingsId: hostInfoId });
          }}
          revealHostInfoSettingsDirectory={(hostInfoId) => {
            window.api.hostSettings.revealSettingsDirectory({ hostSettingsId: hostInfoId });
          }}
          setDefaultHostInfo={(hostInfoId) => {
            this.pool.add(async () => {
              await window.api.hostSettings.setDefault({ hostSettingsId: hostInfoId });
              await this.query();
            });
          }} />
      </NativeContextMenuProvider>
    );
  }
}


if (!window.common.isDarwin) {
  let sheet = window.document.styleSheets[0];

  sheet.insertRule(`
    .startup-right-root {
      padding-top: 3rem;
    }
  `, sheet.cssRules.length);
}


let root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
