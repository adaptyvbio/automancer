import { CreateFeaturesOptions, DynamicValue, Feature, formatDynamicValue, MasterStateLocation, Plugin, PluginBlockImpl, ProtocolState, StateUnit, util } from 'pr1';
import { PluginName, ProtocolBlock, ProtocolBlockName } from 'pr1-shared';


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


export interface ApplierBlock extends ProtocolBlock {
  child: ProtocolBlock;
}

export interface ApplierLocation {
  children: { 0: unknown };
}


export interface PublisherBlock extends ProtocolBlock {
  assignments: [NodePath, DynamicValue][];
  child: ProtocolBlock;
}

export const namespace = ('devices' as PluginName);

export default {
  namespace,
  blocks: {
    ['applier' as ProtocolBlockName]: ({
      getChildren(block, context) {
        return [block.child];
      },
      getChildrenExecution(block, location, context) {
        return [{ location: location.children[0] }];
      }
    } satisfies PluginBlockImpl<ApplierBlock, ApplierLocation>),
    ['publisher' as ProtocolBlockName]: {
      getChildren(block, context) {
        return [block.child];
      },
      createFeatures(block, location, context) {
        let executor = context.host.state.executors[namespace] as ExecutorState;

        return block.assignments.map(([path, value]) => {
          let parentNode = findNode(executor.root, path.slice(0, -1));
          let node = findNode(executor.root, path) as ValueNode;

          return {
            description: `${parentNode.label ?? parentNode.id} › ${node.label ?? node.id}`,
            icon: (node.icon ?? 'settings_input_hdmi'),
            label: formatDynamicValue(value)
          };
        });
      },
    } satisfies PluginBlockImpl<PublisherBlock, never>
  }
} satisfies Plugin
