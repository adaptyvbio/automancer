import { CreateFeaturesOptions, Feature, MasterStateLocation, ProtocolState, AnonymousUnit, util } from 'pr1';


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

export interface ExecutorState {
  root: CollectionNode<DeviceNode>;
}

export interface UnitProtocolState {
  values: [NodePath, string][];
}

export enum NodeWriteError {
  Disconnected = 0,
  Unclaimable = 1,
  ExprError = 2
}

function formatError(error: NodeWriteError): Feature['error'] {
  switch (error) {
    case NodeWriteError.Disconnected: return {
      message: 'Disconnected',
      kind: 'power'
    };

    case NodeWriteError.Unclaimable: return {
      message: 'Unclaimable',
      kind: 'shield'
    };

    case NodeWriteError.ExprError: return {
      message: 'Expression error',
      kind: 'error'
    };
  }
}

export interface UnitStateLocation {
  values: [NodePath, NodeWriteError | null][];
}


const namespace = 'devices';

function createStateFeatures(state: ProtocolState, descendantStates: ProtocolState[] | null, location: MasterStateLocation, options: CreateFeaturesOptions) {
  let executor = options.host.state.executors[namespace] as ExecutorState;
  let unitLocation = location?.[namespace] as UnitStateLocation | undefined;
  let unitStateData = state[namespace] as UnitProtocolState;

  let findNode = (node: BaseNode, path: NodePath): BaseNode =>
    path.length > 0
      ? findNode((node as CollectionNode).nodes[path[0]], path.slice(1))
      : node;

  return unitStateData.values.map(([path, value]) => {
    let node = findNode(executor.root, path);
    let nodeError = unitLocation?.values.find(([otherPath, _error]) => util.deepEqual(otherPath, path))?.[1];

    return {
      disabled: descendantStates?.some((descendantState) => {
        let unitDescendantState = descendantState[namespace] as UnitProtocolState;
        return unitDescendantState?.values.some(([descendantPath, _descendantValue]) => util.deepEqual(path, descendantPath));
      }),
      description: node.label ?? node.id,
      error: nodeError != null
        ? formatError(nodeError)
        : null,
      icon: node.icon ?? 'settings_input_hdmi',
      label: value
    };
  });
}


export default {
  createStateFeatures,
  namespace
} satisfies AnonymousUnit
