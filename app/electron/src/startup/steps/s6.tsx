//* Create local host

import { LargeIcon, React, util } from 'pr1';

import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';
import { LocalHostOptions } from '../../interfaces';


export interface Data extends HostCreatorStepData {
  stepIndex: 6;

  options: LocalHostOptions;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let [error, setError] = React.useState<{ message: string | null; } | null>(null);
  let pool = util.usePool();

  React.useEffect(() => {
    pool.add(async () => {
      let result = await window.api.hostSettings.createLocalHost(props.data.options);

      if (result.ok) {
        await props.queryHostSettings();

        props.setData({
          stepIndex: 2,

          hostSettingsId: result.hostSettingsId,
          label: props.data.options.label
        });
      } else {
        setError({ message: result.message });
      }
    });
  }, []);

  return (
    <div className="startup-editor-contents">
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Set parameters</h2>
        </header>
        {error
          ? (
            <div className="startup-editor-status">
              <LargeIcon name="error" />
              <p>{error.message}</p>
            </div>
          )
          : (
            <div className="startup-editor-status">
              <p>Loading</p>
            </div>
          )}
      </div>
      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" disabled={!error} className="startup-editor-action-item" onClick={() => {
            let installationSettings = props.data.options.pythonInstallationSettings;

            props.setData({
              stepIndex: 5,

              ...props.data.options,
              pythonInstallationSettings: {
                ...installationSettings,
                architecture: installationSettings.architecture ?? '_auto'
              }
            });
          }}>Back</button>
        </div>
      </div>
    </div>
  );
}
