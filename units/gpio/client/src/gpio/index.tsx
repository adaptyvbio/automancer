import { Chip, ChipTabComponentProps, Form } from 'pr1';
import { React } from 'pr1';


export const namespace = 'gpio';


export interface ExecutorState {
  devices: Record<string, {
    id: string;
    connected: boolean;
    label: string | null;
    model: string;
    owner: string;

    nodes: {
      id: string;
      connected: boolean;
      label: string | null;
      data: {
        type: 'boolean';
        targetValue: boolean | null;
        value: boolean | null;
      } | {
        type: 'select';
        options: { label: string; }[];
        targetValue: number | null;
        value: number | null;
      };
    }[];
  }>;
}


export function getGeneralTabs() {
  return [
    {
      id: 'gpio',
      label: 'Devices',
      icon: 'settings_input_hdmi',
      component: DevicesTab
    }
  ];
}


function DevicesTab(props: ChipTabComponentProps) {
  let executor = props.host.state.executors[namespace] as ExecutorState;

  return (
    <main>
      <header className="header header--1">
        <h1>Devices</h1>
      </header>

      {Object.values(executor.devices).map((device) => (
        <React.Fragment key={device.id}>
          <header className="header header--2">
            <h2>{device.label ?? `[${device.model}]`}</h2>
          </header>

          <p>Connected: {device.connected ? 'yes' : 'no'}</p>

          <Form.Form>
            {device.nodes.map((node, nodeIndex) => {
              let label = (node.label ?? node.id);

              let data = node.data;

              if (data.type === 'boolean') {
                data = {
                  type: 'select',
                  options: [
                    { label: 'Off' },
                    { label: 'On' }
                  ],
                  targetValue: (data.targetValue !== null) ? (data.targetValue ? 1 : 0) : null,
                  value: (data.value !== null) ? (data.value ? 1 : 0) : null
                };
              }

              switch (data.type) {
                case 'select': {
                  let busy = (data.value !== data.targetValue);
                  let unknown = (data.value === null);

                  return (
                    <Form.Select
                      label={label + (node.connected ? '' : ' (disconnected)')}
                      onInput={(value) => {
                        props.host.backend.instruct({
                          [namespace]: {
                            type: 'setValue',
                            deviceId: device.id,
                            nodeIndex: nodeIndex,
                            value: (node.data.type === 'boolean') ? (value === 1) : value
                          }
                        });
                      }}
                      options={[
                        ...((unknown && !busy)
                          ? [{ id: -1, label: '–', disabled: true }]
                          : []),
                        ...data.options.map((option, index) => ({
                          id: index,
                          label: (busy && (data.targetValue === index) ? ((!unknown ? (data.options[data.value!].label + ' ') : '') + '→ ') : '') + option.label
                        }))
                      ]}
                      value={busy ? data.targetValue : (unknown ? -1 : data.value)}
                      key={node.id} />
                  );
                }
              }
            })}
          </Form.Form>
        </React.Fragment>
      ))}
    </main>
  );
}
