import { List, Map as ImMap, Set as ImSet } from 'immutable';
import { DynamicValue, PluginContext } from 'pr1';
import { Brand, ClientId, PluginName } from 'pr1-shared';


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
  spec: {
    type: 'boolean';
  } | {
    type: 'numeric';
    dimensionality: Record<`[${string}]`, number>;
    unitFormatted: string | null;
  };
}


export interface ExecutorState {
  root: CollectionNode<DeviceNode>;
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


export interface NodeState {
  connected: boolean;
  value: ContainedValue | null;
  writable: {
    owner: {
      type: 'client';
      clientId: ClientId;
    } | {
      type: 'unknown';
    } | null;
    targetValue: ContainedValue;
  } | null;
}


export type ContainedValue = {
  time: number;
  value: {
    type: 'null';
  } | {
    type: 'default';
    value: unknown;
  } | null;
}

export interface NodeState {
  connected: boolean;
  value: ContainedValue | null;
  writable: {
    owner: {
      type: 'client';
      clientId: ClientId;
    } | {
      type: 'unknown';
    } | null;
    targetValue: ContainedValue;
  } | null;
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
