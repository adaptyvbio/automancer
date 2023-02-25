import { LargeIcon, Pool, React, util } from 'pr1';

import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 1;

  options: {
    hostname: string;
    port: number;
  };
  rawOptions: {
    hostname: string;
    port: string;
  };
}

export function Component(props: HostCreatorStepProps<Data>) {
  let pool = util.usePool();

  let [error, setError] = React.useState<{ message: string | null; } | null>(null);
  let startBackend = React.useRef<boolean>(true);

  React.useEffect(() => {
    if (startBackend.current) {
      startBackend.current = false;

      pool.add(async () => {
        let result = await window.api.hostSettings.connectToRemoteHost({
          hostname: props.data.options.hostname,
          port: props.data.options.port
        });

        if (result.ok) {
          props.setData({
            stepIndex: 2,

            hostSettingsId: result.hostSettingsId,
            label: result.label
          });
        } else if (result.reason === 'unauthorized') {
          props.setData({
            stepIndex: 3,
            options: props.data.options,
            rawOptions: props.data.rawOptions,
            rawPassword: ''
          });
        } else if (result.reason === 'invalid') {
          setError({ message: 'Invalid parameters' });
        } else if (result.reason === 'refused') {
          setError({ message: 'Connection refused' });
        } else {
          setError({ message: 'Unknown error' });
        }
      });
    }
  });

  return (
    <div className="startup-editor-contents">
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Set connection parameters</h2>
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
          <button type="button" className="startup-editor-action-item" onClick={() => {
            if (props.data.rawPassword !== null) {
              props.setData({
                stepIndex: 3,
                options: props.data.options,
                rawOptions: props.data.rawOptions,
                rawPassword: props.data.rawPassword
              });
            } else {
              props.setData({
                stepIndex: 0,
                ...props.data.rawOptions
              });
            }
          }}>Previous</button>
        </div>
        <div className="startup-editor-action-list">
          {error && (
            <button type="button" className="startup-editor-action-item" onClick={() => {
              setError(null);
              startBackend.current = true;
            }}>Retry</button>
          )}
        </div>
      </div>
    </div>
  );
}
