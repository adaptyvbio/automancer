import * as React from 'react';

import type { HostBackendOptions, HostRemoteBackendOptions, HostSettings } from '../host';
import { LargeIcon } from '../components/large-icon';
import * as Form from '../components/standard-form';
import { Pool } from '../util';
import WebsocketBackend from '../backends/websocket';


const pool = new Pool();


export interface HostCreatorProps {
  onCancel(): void;
  onDone(result: {
    settings: HostSettings;
  }): void;
}

export type HostCreatorData =
  HostCreatorStep.S0.Data
  | HostCreatorStep.S1.Data
  | HostCreatorStep.S2.Data
  | HostCreatorStep.S3.Data;

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
      HostCreatorStep.S3.Component
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
      let firstInputRef = React.createRef<HTMLSelectElement>();

      React.useEffect(() => {
        firstInputRef.current!.focus();
      }, []);

      return (
        <form className="startup-editor-contents" onSubmit={(event) => {
          event.preventDefault();

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
            },
            rawPassword: null
          });
        }}>
          <div className="startup-editor-inner">
            <h2>New setup</h2>
            <Form.Form>
              <Form.Select
                label="Protocol"
                onInput={(_id) => { }}
                options={[
                  { id: 'websocket', label: 'Secure WebSocket' }
                ]}
                value="websocket"
                targetRef={firstInputRef} />
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
              <button type="submit" className="startup-editor-action-item">Next</button>
            </div>
          </div>
        </form>
      );
    }
  }

  export namespace S1 {
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
            <h2>New setup</h2>
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
  }

  export namespace S2 {
    export interface Data extends HostCreatorStepData {
      stepIndex: 2;

      identifier: string;
      label: string;
      options: HostBackendOptions;
    }

    export function Component(props: HostCreatorStepProps<Data>) {
      return (
        <div className="startup-editor-contents">
          <div className="startup-editor-inner">
            <h2>New setup</h2>
            <div className="startup-editor-status">
              <LargeIcon name="success" />
              <p>Succesfully connected to "{props.data.label}"</p>
            </div>
          </div>
          <div className="startup-editor-action-root">
            <div className="startup-editor-action-list" />
            <div className="startup-editor-action-list">
              <button type="button" className="startup-editor-action-item" onClick={() => {
                props.done({
                  settings: {
                    id: crypto.randomUUID(),
                    builtin: false,
                    locked: false,
                    label: props.data.label,

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

  export namespace S3 {
    export interface Data extends HostCreatorStepData {
      stepIndex: 3;

      options: HostBackendOptions;
      rawOptions: { address: string; port: string; };
      rawPassword: string;
    }

    export function Component(props: HostCreatorStepProps<Data>) {
      let firstInputRef = React.createRef<HTMLInputElement>();

      React.useEffect(() => {
        firstInputRef.current!.select();
      }, []);

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
            <h2>New setup</h2>
            <Form.Form>
              <Form.TextField
                label="Password"
                onInput={(password) => void props.setData({ ...props.data, rawPassword: password })}
                value={props.data.rawPassword}
                targetRef={firstInputRef} />
            </Form.Form>
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
              <button type="submit" className="startup-editor-action-item">Next</button>
            </div>
          </div>
        </form>
      );
    }
  }
}
