//* Select host type

import { React, Selector } from 'pr1';

import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export type HostSettingsMode = 'advanced' | 'automatic' | 'remote';

export interface Data extends HostCreatorStepData {
  stepIndex: 4;

  mode: HostSettingsMode | null;
}

export function Component(props: HostCreatorStepProps<Data>) {
  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      switch (props.data.mode) {
        case 'advanced': {
          let pythonInstallations = Object.values(props.context.pythonInstallations);
          let pythonInstallationId = (
            pythonInstallations.find((pythonInstallation) => pythonInstallation.leaf) ?? pythonInstallations[0]
          )?.id;

          props.setData({
            stepIndex: 5,

            customPythonInstallation: null,
            label: props.context.computerName,
            pythonInstallationSettings: pythonInstallationId
              ? {
                architecture: '_auto',
                id: pythonInstallationId,
                virtualEnv: false
              }
              : null
          });

          break;
        }

        case 'remote': {
          props.setData({
            stepIndex: 0,

            hostname: '',
            port: '',
            secure: true
          });

          break;
        }
      }
    }}>
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Select a setup configuration</h2>
        </header>
        <Selector
          entries={[
            { id: 'automatic',
              name: 'Default configuration',
              description: 'Create a setup with default settings',
              icon: 'local_shipping',
              disabled: true },
            { id: 'advanced',
              name: 'Advanced configuration',
              description: 'Create a setup with advanced settings',
              icon: 'architecture' },
            { id: 'remote',
              name: 'Remote setup',
              description: 'Connect to an existing setup on this network',
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
