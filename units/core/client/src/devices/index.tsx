import { DynamicValue, formatDynamicValue, Plugin, PluginBlockImpl, util } from 'pr1';
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


export interface ApplierBlock extends ProtocolBlock {
  child: ProtocolBlock;
}

export interface ApplierLocation {
  children: { 0: unknown };
  mode: ApplierLocationMode;
}

export enum ApplierLocationMode {
  Applying = 0,
  Halting = 2,
  Normal = 1
}


export interface PublisherBlock extends ProtocolBlock {
  assignments: [NodePath, DynamicValue][];
  child: ProtocolBlock;
}

export interface PublisherLocation {
  children: { 0: unknown; };
  assignments: [NodePath, DynamicValue | null][];
  mode: {
    type: 'failed';
  } | {
    type: 'halting';
  } | {
    type: 'normal';
    active: boolean;
  };
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
        return (location.mode === ApplierLocationMode.Normal)
          ? [{ location: location.children[0] }]
          : null;
      }
    } satisfies PluginBlockImpl<ApplierBlock, ApplierLocation>),
    ['publisher' as ProtocolBlockName]: {
      getChildren(block, context) {
        return [block.child];
      },
      getChildrenExecution(block, location, context) {
        return (location.mode.type === 'normal')
          ? [{ location: location.children[0] }]
          : null;
      },
      createFeatures(block, location, context) {
        let executor = context.host.state.executors[namespace] as ExecutorState;

        return block.assignments.map(([path, value]) => {
          let parentNode = findNode(executor.root, path.slice(0, -1));
          let node = findNode(executor.root, path) as ValueNode;
          let locationValue = location?.assignments.find(([otherPath, value]) => (util.deepEqual(otherPath, path)))?.[1];

          return {
            description: `${parentNode.label ?? parentNode.id} › ${node.label ?? node.id}`,
            icon: (node.icon ?? 'settings_input_hdmi'),
            label: formatDynamicValue(locationValue ?? value)
          };
        });
      },
      createActions(block, location, context) {
        if (location.mode.type !== 'normal') {
          return [];
        }

        return location.mode.active
          ? [{
            id: 'suspend',
            icon: 'pause',
            onTrigger() {
              context.pool.add(async () => {
                await context.sendMessage({
                  type: 'suspend'
                });
              });
            }
          }]
          : [{
            id: 'apply',
            icon: 'play_arrow',
            onTrigger() {
              context.pool.add(async () => {
                await context.sendMessage({
                  type: 'apply'
                });
              });
            }
          }];
      }
    } satisfies PluginBlockImpl<PublisherBlock, PublisherLocation>
  }
} satisfies Plugin
