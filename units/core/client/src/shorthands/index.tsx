import { BlockUnit, GraphRendererDefaultMetrics, ProtocolBlock } from 'pr1';
import { UnitNamespace } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  child: ProtocolBlock;
}

export type BlockMetrics = GraphRendererDefaultMetrics;

export interface Location {
  children: { 0: unknown; };
}



const namespace = ('shorthands' as UnitNamespace);

export const unit: BlockUnit<Block, BlockMetrics, Location, never> = {
  namespace,
  graphRenderer: {
    computeMetrics(block, ancestors, location, options, context) {
      return options.computeMetrics(block.child, [...ancestors, block], (location?.children[0] ?? null));
    },
    render(block, path, metrics, position, location, options, context) {
      return options.render(block.child, [...path, 0], metrics, position, (location?.children[0] ?? null), options);
    }
  },
  getActiveChildLocation(location, id) {
    return location.children[0];
  },
  getChildBlock(block, key) {
    return block.child;
  },
  getChildrenExecutionRefs(block, location) {
    return location.children[0]
      ? [{
        blockKey: (null as never),
        executionId: 0
      }]
      : [];
  }
}

export default unit;
