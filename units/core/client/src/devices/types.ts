import { List, Map as ImMap, Set as ImSet } from 'immutable';
import { DynamicValue, PluginContext } from 'pr1';
import { Brand, ClientId, PluginName } from 'pr1-shared';
import { SerializedContext } from 'quantops';


export type Context = PluginContext<PersistentStoreEntries, SessionStoreEntries>;

export const namespace = ('devices' as PluginName);

export interface ExecutorState {
  root: CollectionNode<DeviceNode>;
}


export type NodeId = Brand<string, 'NodeId'>;
export type NodePath = List<NodeId>;

export interface BaseNode {
  id: NodeId;
  icon: string | null;
  connected: string;
  description: string;
  label: string | null;
}

export interface CollectionNode<T = BaseNode> extends BaseNode {
  nodes: Record<NodeId, T>;
}

export interface DeviceNode extends CollectionNode {
  owner: string;
}

export interface ValueNode extends BaseNode {
  nullable: boolean;
  readable: boolean;
  writable: boolean;

  spec: {
    type: 'boolean';
  } | {
    type: 'enum';
    cases: {
      id: number | string;
      label: string | null;
    }[];
  } | NumericNodeSpec;
}

export interface NumericNodeSpec {
  type: 'numeric';
  context: SerializedContext;
  range: [number, number] | null;
  resolution: number | null;
}


export interface ExecutorState {
  root: CollectionNode<DeviceNode>;
}

/** @deprecated */
export enum NodeWriteError {
  Disconnected = 0,
  Unclaimable = 1,
  ExprError = 2
}

/** @deprecated */
export interface NodeStateLocation {
  errors: {
    disconnected: boolean;
    evaluation: boolean;
    unclaimable: boolean;
  };
  value: DynamicValue;
}


export interface NodeStateChange {
  connected: boolean;
  valueEvent: ValueEvent | null;
  writer: {
    owner: {
      type: 'client';
      clientId: ClientId;
    } | {
      type: 'unknown';
    } | null;
    targetValueEvent: ValueEvent | null;
  } | null;
}

export interface NodeState {
  connected: boolean;
  history: ValueEvent[];
  lastValueEvent: ValueEvent | null;
  writer: NodeStateChange['writer'];
}

export type NodeStates = ImMap<NodePath, NodeState>;


export interface ValueEvent {
  time: number;
  value: NullableValue | null;
}

export type NullableValue<T = unknown> = {
  type: 'null';
} | {
  type: 'default';
  innerValue: T;
};

export type EnumValue = number | string;

export interface NumericValue {
  magnitude: number;
}


// User composite node
export interface UserNode {
  nodes: ImSet<NodePath>;
}

export interface NodePreference {
  // chartWindowOptionId: number;
  open: boolean;
  // saved: {
  //   open: boolean;
  // };
}

export interface PersistentStoreEntries {
  nodePrefs: ImMap<NodePath, NodePreference>;
  userNodes: List<UserNode>;
};

export interface SessionStoreEntries {
  selectedNodePath: NodePath | null;
}
