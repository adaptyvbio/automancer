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

    return state?.values.map(([path, value]) => {
      let node = findNode(executor.root, path);
      let nodeLocation = location?.values.find(([otherPath, _nodeLocation]) => util.deepEqual(otherPath, path))?.[1];

      let errors: Feature['error'][] = [];

      if (nodeLocation?.errors.disconnected) {
        errors.push({ kind: 'power', message: 'Disconnected' });
      } if (nodeLocation?.errors.unclaimable) {
        errors.push({ kind: 'shield', message: 'Unclaimable' });
      } if (nodeLocation?.errors.evaluation) {
        errors.push({ kind: 'error', message: 'Expression evaluation error' });
      }

      return {
        disabled: descendantStates?.some((descendantState) => {
          return descendantState?.values.some(([descendantPath, _descendantValue]) => util.deepEqual(path, descendantPath));
        }),
        description: node.label ?? node.id,
        error: errors[0] ?? null,
        icon: node.icon ?? 'settings_input_hdmi',
        label: nodeLocation
          ? formatDynamicValue(nodeLocation.value)
          : formatDynamicValue(value)
      };
    }) ?? [];
  }

} satisfies StateUnit<State | undefined, Location>
