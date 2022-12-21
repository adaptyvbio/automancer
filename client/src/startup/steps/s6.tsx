import * as React from 'react';

import { LargeIcon } from '../../components/large-icon';
import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';
import * as util from '../../util';
import { LocalHostOptions } from '../interfaces';


export interface Data extends HostCreatorStepData {
  stepIndex: 6;

  options: LocalHostOptions;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let [error, setError] = React.useState<{ message: string | null; } | null>(null);
  let pool = util.usePool();

  React.useEffect(() => {
    pool.add(async () => {
      let result = await props.createLocalHost(props.data.options);

      if (result.ok) {
        props.setData({
          stepIndex: 2,

          id: result.id,
          label: props.data.options.label
        });
      } else {
        setError({ message: 'Error' });
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
              <p>Failed to connect{error.message && <><br />({error.message})</>}</p>
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
        {/* <div className="startup-editor-action-list"> </div> */}
      </div>
    </div>
  );
}
