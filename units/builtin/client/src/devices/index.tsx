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
    type: 'writableBoolean';
    currentValue: boolean | null;
    targetValue: boolean | null;
  } | {
    type: 'writableEnum';
    options: { label: string; }[];
    currentValue: number | null;
    targetValue: number | null;
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
                node={node as DataNode}
                path={[device.id]}
                key={node.id} />
            ))}
          </Form.Form>
        </React.Fragment>
      ))}

      <pre>{JSON.stringify(executor, null, 2)}</pre>
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

  let label = (node.label ?? node.id) + (node.connected ? '' : ' (disconnected)');
  let data = node.data;

  if (data.type === 'writableBoolean') {
    data = {
      type: 'writableEnum',
      options: [
        { label: 'Off' },
        { label: 'On' }
      ],
      currentValue: (data.currentValue !== null) ? (data.currentValue ? 1 : 0) : null,
      targetValue: (data.targetValue !== null) ? (data.targetValue ? 1 : 0) : null
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

    case 'writableEnum': {
      let { currentValue, options, targetValue } = data;

      let busy = (currentValue !== targetValue);
      let unknown = (currentValue === null);

      return (
        <Form.Select
          label={label}
          onInput={(value) => {
            props.host.backend.instruct({
              [namespace]: {
                type: 'write',
                path,
                value: (node.data.type === 'writableBoolean') ? (value === 1) : value
              }
            });
          }}
          options={[
            ...((unknown && !busy)
              ? [{ id: -1, label: '–', disabled: true }]
              : []),
            ...data.options.map((option, index) => ({
              id: index,
              label: (busy && (targetValue === index) ? ((!unknown ? (options[currentValue!].label + ' ') : '') + '→ ') : '') + option.label
            }))
          ]}
          value={busy ? targetValue : (unknown ? -1 : currentValue)}
          key={node.id} />
      );
    }

    default:
      throw Error();
  }
}
