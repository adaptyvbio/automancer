import * as React from 'react';
import * as Rf from 'retroflex';

import type { BackendCommon } from '../backends/common';
import type { HostSettingsEntry, HostSettingsEntryBackendOptions, LocalBackendStorage } from '..';
import { PyodideBackend } from '../backends/pyodide';
import WebsocketBackend from '../backends/websocket';


export interface HostCreatorProps {
  onCancel(): void;
  onDone(result: { backend: BackendCommon; settings: HostSettingsEntry; }): void;
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
        stepIndex: 0,
        selection: null
      }
    };
  }

  override render() {
    let Step = [
      HostCreatorStep.S0.Component,
      HostCreatorStep.S1.Component,
      HostCreatorStep.S2.Component,
      HostCreatorStep.S3.Component
    ][this.state.data.stepIndex] as HostCreatorStepComponent<unknown>;

    return (
      <Step
        // back={() => { this.setState((state) => ({ step: state.step - 1 })); }}
        // next={() => { this.setState((state) => ({ step: state.step + 1 })); }}
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
  done(result: { backend: BackendCommon; settings: HostSettingsEntry; }): void;

  data: Data;
  setData(data: HostCreatorData | Omit<Data, 'stepIndex'>): void;
  // setData(data: SemiPartial<HostCreatorData, 'stepIndex'>): void;
}

export type HostCreatorStepComponent<Data> = React.FunctionComponent<HostCreatorStepProps<Data>>;

// export interface HostCreatorStepComponent<Data> {
//   (props: HostCreatorStepProps<Data>): void;
// }


export namespace HostCreatorStep {
  export namespace S0 {
    export type EntryId = 'local.filesystem' | 'local.persistent' | null;

    export interface Data extends HostCreatorStepData {
      stepIndex: 0;
      selection: Selection;
    }

    export type Selection = {
      type: 'local.filesystem';
      handle: FileSystemDirectoryHandle;
    } | {
      type: 'local.persistent';
    } | {
      type: 'local.memory';
    } | {
      type: 'remote';
    } | null;

    // export type Data = {
    //   type: 'local';
    //   storage: 'filesystem';
    //   handle: FileSystemHandle;
    // } | {
    //   type: 'local';
    //   storage: 'memory' | 'persistent';
    // } | {
    //   type: 'remote';
    //   address: string;
    //   port: string;
    //   secure: boolean;
    // } | {
    //   type: 'none'
    // };

    // export type Props = HostCreatorStepProps & {
    //   data: Data;
    //   setData(data: Data): void;
    // };

    export function Component(props: HostCreatorStepProps<Data>) {
      let selection = props.data.selection;

      return (
        <Rf.Modal
          title="Create or connect to a setup"
          subtitle="This location will be used to store configuration files and create a local setup."
          actions={{
            backward: [
              { id: 'cancel', name: 'Proceed without a setup' }
            ],
            forward: [
              // { id: 'cancel', name: 'Skip', disabled: true },
              selection?.type === 'remote'
                ? { id: 'next', name: 'Continue', primary: true, role: 'next' }
                : { id: 'next', name: 'Create setup', primary: true, disabled: selection === null }
            ]
          }}
          onClose={props.cancel}
          onSelect={(actionId) => {
            switch (actionId) {
              case 'cancel': {
                props.cancel();
                break;
              }

              case 'next': {
                let sel = selection!;

                if (sel.type.startsWith('local.')) {
                  let id = crypto.randomUUID();

                  let storage = (() => {
                    switch (sel.type) {
                      case 'local.filesystem': return { type: 'filesystem', handle: sel.handle };
                      case 'local.persistent': return { type: 'persistent' };
                      case 'local.memory': return { type: 'memory' };
                    }
                  })() as LocalBackendStorage;

                  let backend = new PyodideBackend({ id, storage });

                  props.setData({
                    stepIndex: 2,
                    backend,
                    backendOptions: {
                      type: 'local',
                      id,
                      storage
                    },
                    previousData: props.data
                  });
                } else if (sel.type === 'remote') {
                  props.setData({
                    stepIndex: 1,
                    settings: {
                      address: '',
                      port: '',
                      secure: false
                    }
                  });
                }
              }
            }
          }}>
        <Rf.Selector
          entries={[
            { id: 'local.filesystem',
              name: selection?.type === 'local.filesystem'
                ? `Local configuration in “${selection.handle.name}”`
                : 'Local configuration',
              description: 'This setup will be synchronized to files on this computer and may be used with another interface.',
              icon: 'source',
              disabled: !('showDirectoryPicker' in window)
            },
            {
              id: 'local.persistent',
              name: 'Persistent browser configuration',
              description: 'This setup will be persistent but limited to the browser interface.',
              icon: 'web'
            },
            {
              id: 'local.memory',
              name: 'In-memory configuration',
              description: 'This setup will be discarded once this tab is closed.',
              icon: 'memory'
            },
            {
              id: 'remote',
              name: 'Remote setup',
              description: 'Configure a remote setup instead.',
              icon: 'sensors'
            }
            // {
            //   id: 'detect',
            //   name: 'Remote setup lookup',
            //   description: 'Configure a remote setup instead.',
            //   icon: 'public'
            // },
            // {
            //   id: 'none',
            //   name: 'No local setup',
            //   description: 'There will be no local setup. A remote setup will need to be configured.',
            //   icon: 'highlight-off'
            // }
          ]}
          onSelect={(selectedEntryId) => {
            switch (selectedEntryId) {
              case 'local.filesystem': {
                window.showDirectoryPicker().then((handle) => {
                  props.setData({
                    stepIndex: 0,
                    selection: {
                      type: 'local.filesystem',
                      handle
                    }
                  });
                }, (err) => {
                  if (err.name !== 'AbortError') {
                    throw err;
                  }
                });

                break;
              }

              case 'local.persistent': {
                props.setData({ selection: { type: 'local.persistent' } });
                break;
              }

              case 'local.memory': {
                props.setData({ selection: { type: 'local.memory' } });
                break;
              }

              case 'remote': {
                props.setData({
                  selection: { type: 'remote' }
                });
              }
            }
          }}
          selectedEntryId={selection?.type ?? 'none'} />
        </Rf.Modal>
      );
    }
  }


  export namespace S1 {
    export interface Data extends HostCreatorStepData {
      stepIndex: 1;
      settings: {
        address: string;
        port: string;
        secure: boolean;
      };
    }

    export function Component(props: HostCreatorStepProps<Data>) {
      let settings = props.data.settings;
      let refInputAddr = React.useRef<HTMLInputElement>(null);

      React.useEffect(() => {
        refInputAddr.current!.focus();
      }, []);

      return (
        <Rf.Modal
          title="Set connection parameters"
          // subtitle="This location will be used to store configuration files and create a local setup."
          actions={{
            backward: [
              { id: 'back', name: 'Back', role: 'previous' }
            ],
            forward: [
              { id: 'next', name: 'Connect', primary: true }
            ]
          }}
          onClose={props.cancel}
          onSelect={(actionId) => {
            switch (actionId) {
              case 'back': {
                props.setData({
                  stepIndex: 0,
                  selection: { type: 'remote' }
                });

                break;
              }

              case 'next': {
                let backendOptions = {
                  address: settings.address,
                  port: parseInt(settings.port),
                  secure: settings.secure
                };

                props.setData({
                  stepIndex: 2,
                  backend: new WebsocketBackend(backendOptions),
                  backendOptions: {
                    type: 'remote',
                    ...backendOptions
                  },
                  previousData: props.data
                });

                break;
              }
            }
          }}>
          <form>
            <div className="nama-line">
              <label className="nama-control">
                <div className="nama-label">Address</div>
                <input type="text" placeholder="e.g. myserver.com" className="nama-input" ref={refInputAddr}
                  value={settings.address}
                  onInput={(event) => void props.setData({ settings: { ...settings, address: event.currentTarget.value } })} />
              </label>
              <label className="nama-control">
                <div className="nama-label">Port</div>
                <input type="text" placeholder="e.g. 4580" className="nama-input"
                  required
                  pattern={/^\d{2,6}$/.source}
                  value={settings.port}
                  onInput={(event) => void props.setData({ settings: { ...settings, port: event.currentTarget.value } })} />
              </label>
            </div>
          </form>
        </Rf.Modal>
      );
    }
  }


  export namespace S2 {
    export interface Data extends HostCreatorStepData {
      stepIndex: 2;

      backend: BackendCommon;
      backendOptions: HostSettingsEntryBackendOptions;
      previousData: HostCreatorData;
    }

    export function Component(props: HostCreatorStepProps<Data>) {
      let [error, setError] = React.useState<string | null>(null);
      let startBackend = React.useRef<boolean>(true);

      React.useEffect(() => {
        if (startBackend.current) {
          startBackend.current = false;

          props.data.backend.start().then(() => {
            props.setData({
              stepIndex: 3,
              backend: props.data.backend,
              backendOptions: props.data.backendOptions
            });
          }, (err) => {
            console.error(err);
            setError(err.message || 'Failed to connect');
          });
        }
      });

      return (
        <Rf.Modal
          title="Connecting to setup"
          actions={{
            backward: [
              { id: 'back', name: 'Back', role: 'previous' }
            ],
            forward: error
              ? [{ id: 'retry', name: 'Retry', role: 'refresh' }]
              : []
          }}
          onClose={props.cancel}
          onSelect={(actionId) => {
            switch (actionId) {
              case 'back': {
                props.setData(props.data.previousData);
                break;
              }

              case 'retry': {
                setError(null);
                startBackend.current = true;
              }
            }
          }}>
          {error
            ? (
              <div className="nama-success">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000"><path d="M12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 13h-2v-2h2v2zm0-4h-2V7h2v6z" opacity=".3" /><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-5h2v2h-2zm0-8h2v6h-2z" /></svg>
                <p>{error}</p>
              </div>
            )
            : <p>Loading...</p>}
        </Rf.Modal>
      );
    }
  }


  export namespace S3 {
    export interface Data extends HostCreatorStepData {
      stepIndex: 3;

      backend: BackendCommon;
      backendOptions: HostSettingsEntryBackendOptions;
    }

    export function Component(props: HostCreatorStepProps<Data>) {
      return (
        <Rf.Modal
          title="Test connection"
          actions={{
            forward: [{ id: 'close', name: 'Close', primary: true }]
          }}
          onClose={() => {
            props.done(createResult(props.data));
          }}
          onSelect={() => {
            props.done(createResult(props.data));
          }}>
          <div className="nama-success">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm-2 13l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" opacity=".3"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z"/></svg>
            <p>Setup created successfully</p>
          </div>
        </Rf.Modal>
      );
    }

    function createResult(data: Data) {
      return {
        backend: data.backend,
        settings: {
          id: crypto.randomUUID(),
          builtin: false,
          disabled: false,
          hostId: null,
          locked: false,
          name: 'Foobar',

          backendOptions: data.backendOptions
        }
      };
    }
  }
}


// export type SemiPartial<Type, Keys> = {
//   [Key in keyof Type]: Key extends Keys ? (Type[Key] | void) : Type[Key];
// }

// export type SemiPartial<T, K> = Partial<T>;

export type SemiPartial<T, K extends number | string | symbol> = T | Omit<T, K>;
