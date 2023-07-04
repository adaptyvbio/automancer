import { Set as ImSet, List } from 'immutable';
import { EvaluableValue, PluginBlockImpl, formatEvaluable, ureg } from 'pr1';
import { MasterBlockLocation, ProtocolBlock, createZeroTerm } from 'pr1-shared';
import { ReactNode, createElement } from 'react';

import { BooleanValue, EnumValue, ExecutorState, NodePathArray, NullableValue, NumericValue, ValueNode, namespace } from '../types';
import { findNode } from '../util';


export interface PublisherBlock extends ProtocolBlock {
  assignments: [NodePathArray, EvaluableValue<NullableValue>][];
  child: ProtocolBlock;
}

export interface PublisherLocation extends MasterBlockLocation {
  children: { 0: MasterBlockLocation; };
  assignments: [NodePathArray, NullableValue | null][];
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
  createFeatures(block, location, descendantPairs, context) {
    let executor = context.host.state.executors[namespace] as ExecutorState;

    let overridenNodePaths = ImSet(
      descendantPairs.flatMap((pair) => {
        if ((pair.block.namespace !== namespace) || (pair.block.name !== 'publisher')) {
          return [];
        }

        let block = pair.block as PublisherBlock;
        return block.assignments.map(([path, value]) => List(path));
      })
    );

    return block.assignments.map(([path, value]) => {
      let parentNode = findNode(executor.root, path.slice(0, -1))!;
      let node = findNode(executor.root, path) as ValueNode;

      let formatInnerValue = (nullableValue: NullableValue) => {
        if (nullableValue.type === 'null') {
          return '[Disabled]';
        }

        switch (node.spec.type) {
          case 'boolean': {
            return (nullableValue.innerValue as BooleanValue) ? 'On' : 'Off';
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
      };

      let locationValue = location?.assignments.find(([otherPath, value]) => List(otherPath).equals(List(path)))?.[1];

      let label: ReactNode = locationValue
        ? formatInnerValue(locationValue)
        : formatEvaluable(value, formatInnerValue);

      return {
        disabled: overridenNodePaths.has(List(path)),
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
        id: 'deactivate',
        icon: 'pause',
        onTrigger() {
          context.pool.add(async () => {
            await context.sendMessage({
              type: 'deactivate'
            });
          });
        }
      }]
      : [{
        id: 'activate',
        icon: 'play_arrow',
        onTrigger() {
          context.pool.add(async () => {
            await context.sendMessage({
              type: 'activate'
            });
          });
        }
      }];
  }
} satisfies PluginBlockImpl<PublisherBlock, PublisherLocation>
