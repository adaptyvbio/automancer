import * as React from 'react';

import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';
import { Selector } from '../selector';


export type HostSettingsMode = 'default' | 'development' | 'remote';

export interface Data extends HostCreatorStepData {
  stepIndex: 4;

  mode: HostSettingsMode | null;
}

export function Component(props: HostCreatorStepProps<Data>) {
  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      switch (props.data.mode) {
        case 'development': {
          props.setData({
            stepIndex: 5,

            dataDirPath: null,
            label: props.context.computerName,
            pythonInstallationPath: null
          });

          break;
        }

        case 'remote': {
          props.setData({
            stepIndex: 0,

            address: '',
            port: ''
          });

          break;
        }
      }
    }}>
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Select a setup type</h2>
        </header>
        <Selector
          entries={[
            { id: 'default',
              name: 'Default setup',
              description: 'Create a setup with default settings',
              icon: 'local_shipping',
              disabled: true },
            { id: 'development',
              name: 'Development setup',
              description: 'Create a setup based on an existing Python installation',
              icon: 'architecture' },
            { id: 'remote',
              name: 'Remote setup',
              description: 'Connect to an existing setup on the same or another network',
              icon: 'cloud' }
          ]}
          onSelect={(mode) => void props.setData({ mode })}
          selectedEntryId={props.data.mode} />
      </div>
      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => void props.cancel()}>Cancel</button>
        </div>
        <div className="startup-editor-action-list">
          <button type="submit" className="startup-editor-action-item" disabled={!props.data.mode}>Next</button>
        </div>
      </div>
    </form>
  );
}
