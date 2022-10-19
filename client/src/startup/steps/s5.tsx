import * as React from 'react';

import * as Form from '../../components/standard-form';
import { HostBackendOptions, HostRemoteBackendOptions } from '../../host';
import { HostCreatorStepData, HostCreatorStepProps, PythonInstallation } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 5;

  dataDirPath: string | null;
  label: string;
  pythonInstallationSettings: {
    architecture: string | null;
    path: string;
  } | null;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let firstInputRef = React.createRef<HTMLInputElement>();
  window.api.hostSettings.getCreatorContext();

  React.useEffect(() => {
    firstInputRef.current!.select();
  }, []);

  let createSelectOptionFromPythonInstallation = (pythonInstallation: PythonInstallation) => ({
    id: pythonInstallation.path,
    label: `${pythonInstallation.path} (${pythonInstallation.info.version.join('.')})`
  });

  let pythonInstallation = props.data.pythonInstallationSettings
    ? props.context.pythonInstallations[props.data.pythonInstallationSettings.path]
    : null;

  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      props.setData({
        stepIndex: 1,
        options: {
          ...(props.data.options as HostRemoteBackendOptions),
          auth: {
            methodIndex: 0,

            type: 'password',
            password: props.data.rawPassword
          }
        },
        rawOptions: props.data.rawOptions,
        rawPassword: props.data.rawPassword
      })
    }}>
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Set parameters</h2>
        </header>
        <Form.Form>
          <Form.TextField
            label="Setup name"
            onInput={(label) => void props.setData({ ...props.data, label })}
            value={props.data.label}
            targetRef={firstInputRef} />
          <Form.Select
            label="Python location"
            onInput={(pythonInstallationPath) => void props.setData({
              ...props.data,
              pythonInstallationSettings: {
                architecture: props.context.pythonInstallations[pythonInstallationPath].info.architectures?.[0] ?? null,
                path: pythonInstallationPath
              }
            })}
            options={[
              { id: '_header.main', label: 'Main locations', disabled: true },
              ...Object.values(props.context.pythonInstallations)
                .filter((pythonInstallation) => pythonInstallation.leaf)
                .map(createSelectOptionFromPythonInstallation),
              { id: '_header.others', label: 'Other locations', disabled: true },
              ...Object.values(props.context.pythonInstallations)
                .filter((pythonInstallation) => !pythonInstallation.leaf)
                .map(createSelectOptionFromPythonInstallation),
              { id: '_header.custom', label: 'Custom locations' },
              { id: '_custom', label: 'Custom location' }
            ]}
            value={props.data.pythonInstallationSettings?.path ?? null} />
          <Form.Select
            label="Architecture"
            onInput={() => {}}
            options={pythonInstallation?.info.architectures?.map((architecture) => ({
              id: architecture,
              label: architecture
            })) ?? [{ id: '_', label: 'Automatic' }]}
            disabled={!pythonInstallation}
            value={null} />
          <Form.Select
            label="Data location"
            onInput={() => {}}
            options={[]}
            value={null} />
        </Form.Form>
      </div>
      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.setData({
              stepIndex: 4,
              mode: 'development'
            });
          }}>Back</button>
        </div>
        <div className="startup-editor-action-list">
          <button type="submit" className="startup-editor-action-item">Next</button>
        </div>
      </div>
    </form>
  );
}
