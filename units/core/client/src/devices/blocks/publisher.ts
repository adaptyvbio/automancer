import { DynamicValue, EvaluableValue, PluginBlockImpl, formatEvaluable, ureg } from 'pr1';
import { MasterBlockLocation, ProtocolBlock, createZeroTerm } from 'pr1-shared';

import { ReactNode, createElement } from 'react';
import { EnumValue, ExecutorState, NodePath, NullableValue, NumericValue, ValueNode, namespace } from '../types';
import { findNode } from '../util';


export interface PublisherBlock extends ProtocolBlock {
  assignments: [NodePath, EvaluableValue<NullableValue>][];
  child: ProtocolBlock;
}

export interface PublisherLocation extends MasterBlockLocation {
  children: { 0: MasterBlockLocation; };
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
    return [{
      block: block.child,
      delay: createZeroTerm()
    }];
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
      // let locationValue = location?.assignments.find(([otherPath, value]) => (util.deepEqual(otherPath, path)))?.[1];

      let label: ReactNode = formatEvaluable(value, (nullableValue) => {
        if (nullableValue.type === 'null') {
          return '[Disabled]';
        }

        switch (node.spec.type) {
          case 'boolean': {
            return nullableValue.innerValue ? 'On' : 'Off';
          }

          case 'enum': {
            let enumValue = nullableValue.innerValue as EnumValue;
            let enumCase = node.spec.cases.find((enumCase) => (enumCase.id === enumValue))!;

            return enumCase.label ?? enumCase.id;
          }

          case 'numeric': {
            let numericValue = nullableValue.innerValue as NumericValue;
            return ureg.formatQuantityAsReact(numericValue.magnitude, (node.spec.resolution ?? 0), ureg.deserializeContext(node.spec.context), { createElement });
          };
        }
      });

      return {
        description: `${parentNode.label ?? parentNode.id} › ${node.label ?? node.id}`,
        icon: (node.icon ?? 'settings_input_hdmi'),
        label
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
