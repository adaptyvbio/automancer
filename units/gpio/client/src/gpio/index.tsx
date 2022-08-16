import { Chip, ChipTabComponentProps, Form } from 'pr1';
import { React } from 'pr1';


export const namespace = 'gpio';


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
  let executor = props.host.state.executors[namespace] as {
    devices: Record<string, {
      id: string;
      connected: boolean;
      label: string | null;
      model: string;
      owner: string;

      nodes: {
        id: string;
        connected: boolean;
        label: string;
        data: {
          type: 'bool';
          value: boolean;
        };
      }[];
    }>;
  };

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
              switch (node.data.type) {
                case 'bool': return (
                  <Form.Select
                    disabled={!node.connected}
                    label={node.id}
                    onInput={(value) => {
                      props.host.backend.instruct({
                        [namespace]: {
                          type: 'setValue',
                          deviceId: device.id,
                          nodeIndex: nodeIndex,
                          value: (value == 'true')
                        }
                      });
                    }}
                    options={[
                      { id: 'false', label: 'False' },
                      { id: 'true', label: 'True' }
                    ]}
                    value={node.data.value ? 'true' : 'false'}
                    key={node.id} />
                );
              }
            })}
          </Form.Form>
        </React.Fragment>
      ))}
    </main>
  );
}
