import { GraphBlockMetrics, GraphRenderer, Host, ProtocolBlock, ProtocolState, Unit } from 'pr1';


export interface Block extends ProtocolBlock {
  child: ProtocolBlock;
  state: ProtocolState;
}

export type BlockMetrics = GraphBlockMetrics;


const namespace = 'state';

const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
  computeMetrics(block, ancestors, options) {
    return options.computeMetrics(block.child, [...ancestors, block]);
  },

  render(block, path, metrics, position, location, options) {
    return options.render(block.child, [...path, null], metrics, position, location, options);
  }
};


function getChildBlock(block: Block, key: number) {
  return block.child;
}

function getBlockDefaultLabel(block: Block, host: Host) {
  return 'State';
}


export default {
  getBlockDefaultLabel,
  getChildBlock,
  graphRenderer,
  namespace
} satisfies Unit
