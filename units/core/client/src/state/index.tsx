import { GraphBlockMetrics, GraphRenderer, Host, ProtocolBlock, ProtocolState, Unit } from 'pr1';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  state: ProtocolState;
}

export interface Location {
  child: unknown;
}

export type BlockMetrics = GraphBlockMetrics;


const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
  computeMetrics(block, ancestors, options) {
    return options.computeMetrics(block.child, [...ancestors, block]);
  },

  render(block, path, metrics, position, location, options) {
    return options.render(block.child, [...path, null], metrics, position, location?.child ?? null, options);
  }
};


export default {
  namespace: 'state',

  graphRenderer,

  getActiveChildLocation(location, key) {
    return location.child;
  },
  getChildrenExecutionKeys(_block, _location) {
    return [null];
  },
  getChildBlock(block, _key) {
    return block.child;
  }
} satisfies Unit<Block, Location>
