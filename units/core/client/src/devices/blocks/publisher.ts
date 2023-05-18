import { DynamicValue, PluginBlockImpl, formatDynamicValue, util } from 'pr1';
import { ProtocolBlock } from 'pr1-shared';

import { ExecutorState, NodePath, ValueNode, namespace } from '../types';
import { findNode } from '../util';


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


export default {
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
      let parentNode = findNode(executor.root, path.slice(0, -1))!;
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
