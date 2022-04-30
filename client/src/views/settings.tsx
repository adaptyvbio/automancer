import { setIn } from 'immutable';
import * as React from 'react';
import * as Rf from 'retroflex';

import type { Host, Model } from '..';
import type { Chip, ChipId, HostId } from '../backends/common';


interface ViewSettingsState {

}

export default class ViewSettings extends React.Component<Rf.ViewProps<Model>, ViewSettingsState> {
  constructor(props: Rf.ViewProps<Model>) {
    super(props);

    this.state = {};
  }

  render() {
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
                  <Rf.PropertiesEntry name="Detection">
                    <Rf.Input.Checkbox name="Listen for hosts advertising themselves" disabled />
                  </Rf.PropertiesEntry>
                  <Rf.PropertiesEntry>
                    <Rf.Input.Checkbox name="Listen for hosts relayed by known hosts" />
                  </Rf.PropertiesEntry>
                  <Rf.PropertiesEntry name="Main host">
                    <Rf.MenuSelect
                      menu={[
                        { id: 'pane', name: 'A' },
                        { id: 'local', name: 'B' },
                        { id: 'window', name: 'C', disabled: true }
                      ]}
                      onSelect={(selection) => {}}
                      selectedOptionPath={['pane']} />
                  </Rf.PropertiesEntry>
                  <Rf.PropertiesEntry name="Actions">
                    <Rf.Input.Button icon="bolt" text="Reboot" />
                  </Rf.PropertiesEntry>
                  <Rf.PropertiesEntry name="Actions">
                    <Rf.Input.Button text="Reboot" />
                  </Rf.PropertiesEntry>
                </div>
              </Rf.PropertiesSection>
              <Rf.PropertiesSection name="Alpha setup">
                  <div className="pr-form-root">
                    <Rf.PropertiesEntry name="Name">
                      <Rf.Input.Text value={'Alpha setup'} />
                    </Rf.PropertiesEntry>
                    <Rf.PropertiesEntry name="Status">
                      <Rf.Input.Output icon="bolt" text="Online" />
                    </Rf.PropertiesEntry>
                    <Rf.PropertiesEntry name="Other">
                      <Rf.Input.Checkbox name="Lock actions on host" />
                    </Rf.PropertiesEntry>
                    <Rf.PropertiesEntry>
                      <Rf.Input.Checkbox name="Hide host" />
                    </Rf.PropertiesEntry>
                  </div>
                <Rf.PropertiesSection name="Protocol">
                  <div className="pr-form-root">
                    <Rf.PropertiesEntry name="Type">
                      <Rf.MenuSelect
                        menu={[
                          { id: 'pane', name: 'Remote server' },
                          { id: 'local', name: 'Local' },
                          { id: 'window', name: 'Internal', disabled: true }
                        ]}
                        onSelect={(selection) => {}}
                        selectedOptionPath={['pane']} />
                    </Rf.PropertiesEntry>
                    <Rf.PropertiesEntry name="Address">
                      <Rf.Input.Text value="192.168.26.147" />
                    </Rf.PropertiesEntry>
                    <Rf.PropertiesEntry name="Actions">
                      <Rf.Input.Button text="Reboot" />
                    </Rf.PropertiesEntry>
                  </div>
                </Rf.PropertiesSection>
              </Rf.PropertiesSection>
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
                <Rf.PropertiesEntry name="Other">
                  <Rf.Input.Checkbox name="Prevent device lock" />
                </Rf.PropertiesEntry>
                <Rf.PropertiesEntry>
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
