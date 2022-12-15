import { GraphBlockMetrics, GraphRenderer, Host, ProtocolBlock, ProtocolState, AnonymousUnit, Unit } from 'pr1';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  state: ProtocolState;
}

export type BlockMetrics = GraphBlockMetrics;


const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
  computeMetrics(block, ancestors, options) {
    return options.computeMetrics(block.child, [...ancestors, block]);
  },

  render(block, path, metrics, position, location, options) {
    return options.render(block.child, [...path, null], metrics, position, location, options);
  }
};


export default {
  namespace: 'state',

  graphRenderer,

  // getBlockDefaultLabel(block, host) {
  //   return 'State';
  // },
  getChildBlock(block, key) {
    return block.child;
  }
} satisfies Unit<Block>
