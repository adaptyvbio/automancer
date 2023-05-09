import { Protocol, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';

import { Host } from './host';
import { PluginContext } from './interfaces/plugin';


export interface BlockGroup {
  blocks: ProtocolBlock[];
  name: string | null;
  path: ProtocolBlockPath;
}


export function getBlockImpl(block: ProtocolBlock, context: PluginContext) {
  return context.host.plugins[block.namespace].blocks[block.name];
}


export function getBlockName(block: ProtocolBlock) {
  return (block.namespace === 'name')
    ? (block.value as string)
    : null;
}


/**
 * Analyzes the provided block to identify ancestor groups.
 *
 * Rules
 *  1. Only one `name` block can be present in a group. If another `name` block is encountered, a new group is created with this block as its root.
 *  2. Certain blocks known as _sparse_ blocks, especially those which require custom graph rendering such as `sequence` and `parallel` blocks, are always at the root of their group. If such a block is encountered, a new group is created.
 *  3. A block is _terminal_ if it contains no children, regardless of whether the target block is that block or one its children.
 *  4. The leaf block is the target block, as specified by the path provided as an argument.
 */
export function analyzeBlockPath(protocol: Protocol, blockPath: ProtocolBlockPath, context: PluginContext) {
  let blocks: ProtocolBlock[] = [protocol.root];
  let groups: BlockGroup[] = [{
    blocks: [],
    name: protocol.name,
    path: []
  }];

  let isLeafBlockTerminal = false;


  let currentBlock = protocol.root;

  for (let key of blockPath) {
    let currentBlockImpl = getBlockImpl(currentBlock, context);
    currentBlock = currentBlockImpl.getChild!(currentBlock, key);
    blocks.push(currentBlock);
  }

  for (let [blockIndex, block] of blocks.entries()) {
    let isBlockLeaf = (blockIndex === (blocks.length - 1));

    let group = groups.at(-1);
    let blockName = getBlockName(block);
    let blockImpl = getBlockImpl(block, context);

    if (isBlockLeaf && !blockImpl.getChild) {
      isLeafBlockTerminal = true;
      continue;
    }

    if (blockImpl.computeGraph || (blockName && group.name)) {
      group = {
        blocks: [],
        name: null,
        path: []
      };

      groups.push(group);
    }

    if (blockName) {
      group.name = blockName;
    }

    group.blocks.push(block);

    if (blockIndex > 0) {
      group.path.push(blockPath[blockIndex]);
    }
  }

  return {
    blocks,
    groups,
    isLeafBlockTerminal
  };
}
