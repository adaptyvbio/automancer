import { NodeHierarchy, DynamicValue, Feature, formatDynamicValue, GeneralTabComponentProps, React, StateUnit, TitleBar, util } from 'pr1';
import { UnitNamespace } from 'pr1-shared';


export type NodePath = string[];

export interface BaseNode {
  id: string;
  icon: string | null;
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

export interface ValueNode extends BaseNode {
  value: {
    nullable: boolean;
    readable: boolean;
    writable: boolean;
  } & ({
    type: 'boolean';
    value: boolean;
  } | {
    type: 'enum';
    cases: {
      id: number | string;
      label: string | null;
    }[];
    value: number | string;
  } | {
    type: 'numeric';
    value: DynamicValue;
  });
}


const findNode = (node: BaseNode, path: NodePath): BaseNode =>
  path.length > 0
    ? findNode((node as CollectionNode).nodes[path[0]], path.slice(1))
    : node;


export interface ExecutorState {
  root: CollectionNode<DeviceNode>;
}

export interface State {
  values: [NodePath, DynamicValue][];
}

export enum NodeWriteError {
  Disconnected = 0,
  Unclaimable = 1,
  ExprError = 2
}

export interface NodeStateLocation {
  errors: {
    disconnected: boolean;
    evaluation: boolean;
    unclaimable: boolean;
  };
  value: DynamicValue;
}

export interface Location {
  values: [NodePath, NodeStateLocation][];
}


const namespace = ('devices' as UnitNamespace);

function DeviceControlTab(props: GeneralTabComponentProps) {
  let executor = (props.host.state.executors[namespace] as ExecutorState);
  console.log(executor)

  return (
    <>
      <TitleBar title="Device control" />
      <div>
        <NodeHierarchy entries={[
          { type: 'node',
            id: 'a',
            detail: '34.7ºC',
            icon: 'thermostat',
            label: 'Temperature readout' },
          {
            type: 'collection',
            id: 'b',
            label: 'Temperature controller',
            sublabel: 'Okolab H401-K temperature controller',
            children: [
              { type: 'node',
                id: 'a',
                detail: '34.7ºC',
                icon: 'thermostat',
                label: 'Temperature readout' },
              { type: 'node',
                id: 'b',
                detail: '35.2ºC',
                icon: 'thermostat',
                label: 'Temperature setpoint',
                error: 'Problem' },
            ]
          },
          {
            type: 'collection',
            id: 'c',
            label: 'System',
            children: [
              { type: 'node',
                id: 'a',
                detail: '53 years',
                icon: 'schedule',
                label: 'Epoch' },
              { type: 'node',
                id: 'b',
                detail: '2 hrs 28 min',
                icon: 'history',
                label: 'Alive duration' },
              { type: 'node',
                id: 'c',
                detail: '294 MB',
                icon: 'memory',
                label: 'Process memory usage' },
              { type: 'node',
                id: 'd',
                detail: '0.6721',
                icon: 'monitoring',
                label: 'Random value' }
            ]
          }
        ]} />
      </div>
    </>
  )
}


export default {
  namespace,

  createStateFeatures(state, descendantStates, location, context) {
    let executor = context.host.state.executors[this.namespace] as ExecutorState;

    return state.values.map(([path, stateValue]) => {
      let parentNode = findNode(executor.root, path.slice(0, -1));
      let node = findNode(executor.root, path) as ValueNode;
      let nodeLocation = location?.values.find(([otherPath, _nodeLocation]) => util.deepEqual(otherPath, path))?.[1];

      let errors: Feature['error'][] = [];

      if (nodeLocation?.errors.disconnected) {
        errors.push({ kind: 'power', message: 'Disconnected' });
      } if (nodeLocation?.errors.unclaimable) {
        errors.push({ kind: 'shield', message: 'Unclaimable' });
      } if (nodeLocation?.errors.evaluation) {
        errors.push({ kind: 'error', message: 'Expression evaluation error' });
      }

      let label: JSX.Element | string;

      let currentValue = nodeLocation
        ? nodeLocation.value
        : stateValue;

      if (currentValue.type === 'expression') {
        label = formatDynamicValue(currentValue);
      } else if (currentValue.type === 'none') {
        label = '[Disabled]';
      } else {
        switch (node.value.type) {
          case 'boolean': {
            label = formatDynamicValue(currentValue);
            break;
          }

          case 'enum': {
            util.assert((currentValue.type === 'number') || (currentValue.type === 'string'));
            let innerValue = currentValue.value;
            let enumCase = node.value.cases.find((enumCase) => (enumCase.id === innerValue))!;
            label = (enumCase.label ?? enumCase.id.toString());

            break;
          }

          case 'numeric': {
            util.assert(currentValue.type === 'quantity');
            label = formatDynamicValue(currentValue);
            break;
          }

          default:
            throw new Error();
        }
      }

      return {
        disabled: descendantStates?.some((descendantState) => {
          return descendantState?.values.some(([descendantPath, _descendantValue]) => util.deepEqual(path, descendantPath));
        }),
        description: `${parentNode.label ?? parentNode.id} › ${node.label ?? node.id}`,
        error: errors[0] ?? null,
        icon: node.icon ?? 'settings_input_hdmi',
        label
      };
    }) ?? [];
  },

  generalTabs: [{
    id: 'manual',
    icon: 'tune',
    label: 'Device control',
    component: DeviceControlTab
  }]
} satisfies StateUnit<State, Location>
