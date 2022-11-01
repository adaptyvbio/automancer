import { Chip, ChipTabComponentProps, Form, Host } from 'pr1';
import { React } from 'pr1';


export const namespace = 'devices';


export interface BaseNode {
  id: string;
  connected: string;
  label: string | null;
}

export interface CollectionNode<T = BaseNode> extends BaseNode {
  nodes: Record<BaseNode['id'], T>;
}

export interface DeviceNode extends CollectionNode {
  model: string;
  owner: string;
}

export interface DataNode extends BaseNode {
  data: {
    type: 'readableBoolean';
    targetValue: boolean | null;
    value: boolean | null;
  } | {
    type: 'readableEnum';
    options: { label: string; }[];
    targetValue: number | null;
    value: number | null;
  } | {
    type: 'readableScalar';
    value: number | null;
  } | {
    type: 'writableScalar';
    currentValue: number | null;
    targetValue: number | null;
  };
}

export interface ExecutorState {
  root: CollectionNode<DeviceNode>;
}


export function getGeneralTabs() {
  return [
    {
      id: 'devices',
      label: 'Devices',
      icon: 'settings_input_hdmi',
      component: DevicesTab
    }
  ];
}


function DevicesTab(props: ChipTabComponentProps) {
  let executor = props.host.state.executors[namespace] as ExecutorState;

  React.useEffect(() => {
    props.host.backend.instruct({
      [namespace]: { type: 'register' }
    });
  }, []);

  // return (
  //   <main>
  //     <header className="header header--1">
  //       <h1>Devices</h1>
  //     </header>
  //     <pre>{JSON.stringify(executor, null, 2)}</pre>
  //   </main>
  // );

  return (
    <main>
      <header className="header header--1">
        <h1>Devices</h1>
      </header>
      <pre>{JSON.stringify(executor, null, 2)}</pre>

      {Object.values(executor.root.nodes).map((device) => (
        <React.Fragment key={device.id}>
          <header className="header header--2">
            <h2>{(device.label ? `${device.label} ` : '') + ` [${device.model}]`}</h2>
          </header>

          <p>Connected: {device.connected ? 'yes' : 'no'}</p>
          {/* <pre>{JSON.stringify(device, null, 2)}</pre> */}

          <Form.Form>
            {Object.values(device.nodes).map((node, nodeIndex) => (
              <WritableNode
                host={props.host}
                node={node}
                path={[device.id]}
                key={node.id} />
            ))}
          </Form.Form>
        </React.Fragment>
      ))}
    </main>
  );
}


function WritableNode(props: {
  host: Host;
  node: DataNode;
  path: string[];
}) {
  let node = props.node;
  let path = [...props.path, node.id];

  let label = (node.label ?? node.id);
  let data = node.data;

  if (data.type === 'readableBoolean') {
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
    case 'readableScalar': {
      return (
        <React.Fragment key={node.id}>{label}: {data.value ?? '–'}</React.Fragment>
      );
    }

    case 'writableScalar': {
      let [value, setValue] = React.useState(data.targetValue !== null ? data.targetValue.toString() : '');

      return (
        <Form.TextField
          label={label}
          onBlur={() => {
            props.host.backend.instruct({
              [namespace]: {
                type: 'write',
                path,
                value: parseFloat(value)
              }
            });
          }}
          onInput={(value) => void setValue(value)}
          value={value}
          key={node.id} />
      );
    }

    case 'readableEnum': {
      let busy = (data.value !== data.targetValue);
      let unknown = (data.value === null);

      return (
        <Form.Select
          label={label + (node.connected ? '' : ' (disconnected)')}
          onInput={(value) => {
            props.host.backend.instruct({
              [namespace]: {
                type: 'setValue',
                path,
                value: (data.type === 'readableBoolean') ? (value === 1) : value
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

    default:
      throw Error();
  }
}
