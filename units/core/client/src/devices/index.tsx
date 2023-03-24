import { CreateFeaturesOptions, DynamicValue, Feature, formatDynamicValue, MasterStateLocation, ProtocolState, StateUnit, util } from 'pr1';


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


export default {
  namespace: 'devices',

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
          case 'enum': {
            util.assert((currentValue.type === 'number') || (currentValue.type === 'string'));
            let innerValue = currentValue.value;

            let enumCase = node.value.cases.find((enumCase) => (enumCase.id === innerValue))!;
            label = (enumCase.label ?? enumCase.id.toString());

            break;
          }

          default:
            util.assert(currentValue.type === 'quantity');
            label = formatDynamicValue(currentValue);
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
  }
} satisfies StateUnit<State, Location>
