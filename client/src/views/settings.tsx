import { setIn } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';


interface ViewSettingsState {

}

export default class ViewSettings extends React.Component<Rf.ViewProps<Model>, ViewSettingsState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {};
  }

  render() {
    let hosts = Object.values(this.props.model.hosts);

    let settings = this.props.model.settings;
    let setInSettings = (path: Iterable<unknown>, value: unknown) => {
      this.props.app.setModel((model) => setIn(model, ['settings', ...path], value));
    };

    return (
      <>
        <Rf.ViewHeader>
          <div className="toolbar-root">
            <div className="toolbar-group"></div>
          </div>
        </Rf.ViewHeader>
        <Rf.ViewBody>
          <div className="pr-section-list">
            <Rf.PropertiesSection name="Hosts">
              <Rf.PropertiesSection name="General">
                <div className="pr-form-root">
                  <Rf.PropertiesEntry name="Detection" group>
                    <Rf.Input.Checkbox name="Listen for hosts advertising themselves" disabled />
                    <Rf.Input.Checkbox name="Listen for hosts relayed by known hosts" disabled />
                  </Rf.PropertiesEntry>
                  <Rf.PropertiesEntry name="Default host">
                    <Rf.MenuSelect
                      menu={hosts.length > 0
                        ? hosts.map((host) => ({
                          id: host.id,
                          name: host.state.info.name
                        }))
                        : [{ id: '_none', name: 'No hosts defined', disabled: true }]}
                      onSelect={(selection) => {
                        setInSettings(['defaultHostId'], selection.first()!);
                      }}
                      selectedOptionPath={settings.defaultHostId && [settings.defaultHostId]} />
                  </Rf.PropertiesEntry>
                  <Rf.PropertiesEntry name="Manage">
                    <Rf.Input.Button text="Add host" onClick={() => {
                      let id = crypto.randomUUID();

                      setInSettings(['hosts', id], {
                        id,
                        name: null,
                        builtin: false,
                        disabled: false,
                        locked: false,

                        backendOptions: {
                          type: 'inactive'
                        }
                      });
                    }} />
                  </Rf.PropertiesEntry>
                </div>
              </Rf.PropertiesSection>
              {Object.values(settings.hosts).map((hostSettings) => {
                let hostPath = ['settings', 'hosts', hostSettings.id];

                let proto = hostSettings.backendOptions;
                let protoPath = [...hostPath, 'backendOptions'];

                return (
                  <Rf.PropertiesSection name={hostSettings.name ?? 'Untitled host'} key={hostSettings.id}>
                    <div className="pr-form-root">
                      <Rf.PropertiesEntry name="Name">
                        <Rf.Input.Text value={hostSettings.name ?? ''} onChange={(name) => {
                          this.props.app.setModel({
                            settings: setIn(settings, ['hosts', hostSettings.id, 'name'], name || null)
                          });
                        }} />
                      </Rf.PropertiesEntry>
                      <Rf.PropertiesEntry name="Status">
                        <Rf.Input.Output {...(() => {
                          if (!hostSettings.hostId) {
                            return { text: 'Inactive' };
                          }

                          return { text: 'Active' };
                        })()} />
                      </Rf.PropertiesEntry>
                      <Rf.PropertiesEntry name="Other" group>
                        <Rf.Input.Checkbox name="Read-only mode" value={hostSettings.locked} onChange={(value) => {
                          this.props.app.setModel((model) => setIn(model, [...hostPath, 'locked'], value));
                        }} />
                        <Rf.Input.Checkbox name="Disable" value={hostSettings.disabled} onChange={(value) => {
                          this.props.app.setModel((model) => setIn(model, [...hostPath, 'disabled'], value));
                        }} />
                      </Rf.PropertiesEntry>
                    </div>
                    <Rf.PropertiesSection name="Location">
                      <div className="pr-form-root">
                        <Rf.PropertiesEntry name="Type">
                          <Rf.MenuSelect
                            disabled={hostSettings.builtin}
                            menu={[
                              { id: 'inactive', name: 'Inactive' },
                              { id: 'remote', name: 'Remote' },
                              { id: 'local', name: 'Local', disabled: true },
                              { id: 'internal', name: 'Internal', disabled: true }
                            ]}
                            onSelect={(selection) => {
                              let type = selection.first()!;

                              let opts = (() => {
                                switch (type) {
                                  case 'remote': return {
                                    address: '',
                                    port: 4567,
                                    secure: true
                                  };
                                  default: return {}
                                }
                              })();

                              let updatedSettings = {
                                ...hostSettings,
                                backendOptions: {
                                  type,
                                  ...opts
                                }
                              };

                              this.props.app.setModel((model) => setIn(model, hostPath, updatedSettings));

                              if (type === 'inactive') {
                                this.props.app.updateHostLocation(updatedSettings as any);
                              }
                            }}
                            selectedOptionPath={[proto.type]} />
                        </Rf.PropertiesEntry>
                        {(proto.type === 'remote') && (
                          <>
                            <Rf.PropertiesEntry name="Protocol">
                              <Rf.MenuSelect
                                menu={[
                                  { id: 'auto', name: 'Automatic' },
                                  { id: '_divider', type: 'divider' },
                                  { id: 'default', name: 'PR-1 server', disabled: true }
                                ]}
                                onSelect={(selection) => {}}
                                selectedOptionPath={['auto']} />
                            </Rf.PropertiesEntry>
                            <Rf.PropertiesEntry name="Address">
                              <Rf.Input.Text value={proto.address} onChange={(address) => {
                                this.props.app.setModel((model) => setIn(model, [...protoPath, 'address'], address));
                              }} />
                            </Rf.PropertiesEntry>
                            <Rf.PropertiesEntry>
                              <Rf.Input.Checkbox name="Secure connection" value={proto.secure} onChange={(secure) => {
                                this.props.app.setModel((model) => setIn(model, [...protoPath, 'secure'], secure));
                              }} />
                            </Rf.PropertiesEntry>
                            <Rf.PropertiesEntry name="Actions">
                              <Rf.Input.Button text="Connect" onClick={() => {
                                this.props.app.updateHostLocation(hostSettings);
                              }} />
                            </Rf.PropertiesEntry>
                            <Rf.PropertiesEntry>
                              <Rf.Input.Button text="Reboot" disabled={hostSettings.locked} />
                            </Rf.PropertiesEntry>
                          </>
                        )}
                      </div>
                    </Rf.PropertiesSection>
                  </Rf.PropertiesSection>
                );
              })}
            </Rf.PropertiesSection>
            <Rf.PropertiesSection name="User interface">
              <div className="pr-form-root">
                <Rf.PropertiesEntry name="Display mode">
                  <Rf.MenuSelect
                    menu={[
                      { id: 'pane', name: 'Pane' },
                      { id: 'window', name: 'Window' }
                    ]}
                    onSelect={(selection) => {}}
                    selectedOptionPath={['pane']} />
                </Rf.PropertiesEntry>
                <Rf.PropertiesEntry name="Other" group>
                  <Rf.Input.Checkbox name="Prevent device lock" />
                </Rf.PropertiesEntry>
              </div>
            </Rf.PropertiesSection>
            <Rf.PropertiesSection name="Update">

            </Rf.PropertiesSection>
          </div>
        </Rf.ViewBody>
      </>
    );
  }
}
