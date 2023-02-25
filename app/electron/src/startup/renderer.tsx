import { HostInfo, HostInfoId, Pool, React, ReactDOM, Startup } from 'pr1';
import seqOrd from 'seq-ord';

import { HostCreator } from './host-creator';
import { NativeContextMenuProvider } from '../shared/context-menu';
import { HostSettingsId, HostSettingsRecord } from '../interfaces';


export interface AppProps {

}

export interface AppState {
  defaultHostSettingsId: HostSettingsId | null;
  hostSettingsRecord: HostSettingsRecord | null;
}

export class App extends React.Component<AppProps, AppState> {
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
      await this.query();
      window.api.main.ready();
    });
  }

  async query() {
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
              await window.api.hostSettings.delete({ hostSettingsId: (hostInfoId as string as HostSettingsId) });
              await this.query();
            });
          }}
          launchHostInfo={(hostInfoId) => {
            window.api.hostSettings.launchHost({ hostSettingsId: (hostInfoId as string as HostSettingsId) });
          }}
          renderHostCreator={({ close }) => (
            <HostCreator
              close={close}
              update={async () => void await this.query()} />
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
              await this.query();
            });
          }} />
      </NativeContextMenuProvider>
    );
  }
}


if (!window.api.isDarwin) {
  let sheet = window.document.styleSheets[0];

  sheet.insertRule(`
    .startup-right-root {
      padding-top: 3rem;
    }
  `, sheet.cssRules.length);
}


let root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
