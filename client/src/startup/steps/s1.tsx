import * as React from 'react';

import WebsocketBackend from '../../backends/websocket';
import { LargeIcon } from '../../components/large-icon';
import { HostBackendOptions, HostRemoteBackendOptions } from '../../host';
import { Pool } from '../../util';
import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


const pool = new Pool();

export interface Data extends HostCreatorStepData {
  options: HostBackendOptions;
  rawOptions: { address: string; port: string; };
  rawPassword: string | null;
  stepIndex: 1;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let [error, setError] = React.useState<{ message: string | null; } | null>(null);
  let startBackend = React.useRef<boolean>(true);

  React.useEffect(() => {
    if (startBackend.current) {
      startBackend.current = false;

      pool.add(async () => {
        let result = await WebsocketBackend.test(props.data.options as HostRemoteBackendOptions);

        if (result.ok) {
          props.setData({
            stepIndex: 2,
            identifier: result.identifier,
            label: result.label,
            options: props.data.options
          });
        } else if (result.reason === 'unauthorized') {
          props.setData({
            stepIndex: 3,
            options: props.data.options,
            rawOptions: props.data.rawOptions,
            rawPassword: ''
          });
        } else if (result.reason === 'invalid_auth') {
          setError({ message: result.message });
        } else if (result.reason === 'unknown') {
          setError({ message: result.message });
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
