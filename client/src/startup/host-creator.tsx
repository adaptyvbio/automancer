import * as React from 'react';

import type { HostBackendOptions, HostSettings } from '../host';
import { createBackend } from '../backends/misc';
import * as Form from '../components/standard-form';
import type { BaseBackend } from '../backends/base';
import { AppBackend } from '../app-backends/base';
import { Application } from '../application';


export interface HostCreatorProps {
  app: Application;
  onCancel(): void;
  onDone(result: {
    backend: BaseBackend;
    settings: HostSettings;
  }): void;
}

export type HostCreatorData =
  HostCreatorStep.S0.Data
  | HostCreatorStep.S1.Data
  | HostCreatorStep.S2.Data;

export interface HostCreatorState {
  data: HostCreatorData;
}

export class HostCreator extends React.Component<HostCreatorProps, HostCreatorState> {
  constructor(props: HostCreatorProps) {
    super(props);

    this.state = {
      data: {
        address: '',
        port: '',

        stepIndex: 0
      }
    };
  }

  render() {
    let Step = [
      HostCreatorStep.S0.Component,
      HostCreatorStep.S1.Component,
      HostCreatorStep.S2.Component,
      // HostCreatorStep.S3.Component
    ][this.state.data.stepIndex] as HostCreatorStepComponent<unknown>;

    return (
      <Step
        cancel={this.props.onCancel}
        done={this.props.onDone}
        data={this.state.data}
        setData={(data) => {
          this.setState({
            data: ({ stepIndex: this.state.data.stepIndex, ...data } as HostCreatorData)
          });
        }} />
    );
  }
}


export interface HostCreatorStepData {
  stepIndex: number;
}

export interface HostCreatorStepProps<Data = HostCreatorData> {
  cancel(): void;
  done(result: {
    backend: BaseBackend;
    settings: HostSettings;
  }): void;

  data: Data;
  setData(data: HostCreatorData | Omit<Data, 'stepIndex'>): void;
}

export type HostCreatorStepComponent<Data> = React.FunctionComponent<HostCreatorStepProps<Data>>;


export namespace HostCreatorStep {
  export namespace S0 {
    export interface Data extends HostCreatorStepData {
      address: string;
      port: string;

      stepIndex: 0;
    }

    export function Component(props: HostCreatorStepProps<Data>) {
      return (
        <>
          <div className="startup-editor-contents">
            <div className="startup-editor-inner">
              <h2>New setup</h2>
              <Form.Form>
                <Form.Select
                  label="Protocol"
                  onInput={() => { }}
                  options={[
                    { id: 'websocket', label: 'Secure WebSocket' }
                  ]}
                  value="websocket" />
                <Form.TextField
                  label="Address"
                  onInput={(address) => void props.setData({ ...props.data, address })}
                  placeholder="e.g. 192.168.1.143"
                  value={props.data.address} />
                <Form.TextField
                  label="Port"
                  onInput={(port) => void props.setData({ ...props.data, port })}
                  placeholder="e.g. 4567"
                  value={props.data.port} />
              </Form.Form>
            </div>

            <div className="startup-editor-action-root">
              <div className="startup-editor-action-list">
                <button type="button" className="startup-editor-action-item" onClick={() => void props.cancel()}>Cancel</button>
              </div>
              <div className="startup-editor-action-list">
                <button type="button" className="startup-editor-action-item" onClick={() => {
                  props.setData({
                    stepIndex: 1,
                    options: {
                      type: 'remote',
                      auth: null,
                      address: props.data.address,
                      port: parseInt(props.data.port),
                      secure: false
                    },
                    rawOptions: {
                      address: props.data.address,
                      port: props.data.port
                    }
                  });
                }}>Next</button>
              </div>
            </div>
          </div>
        </>
      );
    }
  }

  export namespace S1 {
    export interface Data extends HostCreatorStepData {
      options: HostBackendOptions;
      rawOptions: { address: string; port: string; };
      stepIndex: 1;
    }

    export function Component(props: HostCreatorStepProps<Data>) {
      let [error, setError] = React.useState<string | null>(null);
      let startBackend = React.useRef<boolean>(true);

      React.useEffect(() => {
        if (startBackend.current) {
          startBackend.current = false;

          (async () => {
            let backend = await createBackend(props.data.options);
            await backend.start();
            props.setData({
              stepIndex: 2,
              backend,
              options: props.data.options
            });
          })().catch((err) => {
            setError(err.message);
          });
        }
      });

      return (
        <div className="startup-editor-contents">
          <div className="startup-editor-inner">
            <h2>New setup</h2>
            {error && (
              <div className="startup-editor-status">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000"><path d="M12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 13h-2v-2h2v2zm0-4h-2V7h2v6z" opacity=".3" /><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-5h2v2h-2zm0-8h2v6h-2z" /></svg>
                <p>{error}</p>
              </div>
            )}
          </div>
          <div className="startup-editor-action-root">
            <div className="startup-editor-action-list">
              <button type="button" className="startup-editor-action-item" onClick={() => {
                props.setData({
                  stepIndex: 0,
                  ...props.data.rawOptions
                });
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
  }

  export namespace S2 {
    export interface Data extends HostCreatorStepData {
      backend: BaseBackend;
      options: HostBackendOptions;
      stepIndex: 2;
    }

    export function Component(props: HostCreatorStepProps<Data>) {
      let label = props.data.backend.state.info.name;

      return (
        <div className="startup-editor-contents">
          <div className="startup-editor-inner">
            <h2>New setup</h2>
            <div className="startup-editor-status">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm-2 13l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" opacity=".3" /><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z" /></svg>
              <p>Succesfully connected to "{label}"</p>
            </div>
          </div>
          <div className="startup-editor-action-root">
            <div className="startup-editor-action-list" />
            <div className="startup-editor-action-list">
              <button type="button" className="startup-editor-action-item" onClick={() => {
                props.done({
                  backend: props.data.backend,
                  settings: {
                    id: crypto.randomUUID(),
                    builtin: false,
                    hostId: null,
                    locked: false,
                    label,

                    backendOptions: props.data.options
                  }
                })
              }}>Finish</button>
            </div>
          </div>
        </div>
      );
    }
  }
}
