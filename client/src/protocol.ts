import { Protocol, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';

import { Host } from './host';
import { PluginContext } from './interfaces/plugin';


export interface BlockGroup {
  name: string | null;
  pairs: BlockPair[];
  path: ProtocolBlockPath;
}

export interface BlockPair {
  block: ProtocolBlock;
  location: unknown | null;
}

// export interface BlockPairWithOptionalLocation {
//   block: ProtocolBlock;
//   location: unknown | null;
// }


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
export function analyzeBlockPath(
  protocol: Protocol,
  rootLocation: unknown | null,
  blockPath: ProtocolBlockPath,
  context: PluginContext
) {
  let pairs: BlockPair[] = [{
    block: protocol.root,
    location: rootLocation
  }];

  let groups: BlockGroup[] = [{
    name: protocol.name,
    pairs: [],
    path: []
  }];

  let isLeafBlockTerminal = false;


  let currentBlock = protocol.root;
  let currentLocation = rootLocation;

  for (let key of blockPath) {
    let currentBlockImpl = getBlockImpl(currentBlock, context);

    currentLocation = currentLocation && (currentBlockImpl.getChildrenExecution!(currentBlock, currentLocation, context)[key]?.location ?? null);
    currentBlock = currentBlockImpl.getChildren!(currentBlock, context)[key];

    pairs.push({
      block: currentBlock,
      location: currentLocation
    });
  }

  for (let [blockIndex, { block, location }] of pairs.entries()) {
    let isBlockLeaf = (blockIndex === (pairs.length - 1));

    let group = groups.at(-1);
    let blockName = getBlockName(block);
    let blockImpl = getBlockImpl(block, context);

    if (isBlockLeaf && !blockImpl.getChildren) {
      isLeafBlockTerminal = true;
      continue;
    }

    if (blockImpl.computeGraph || (blockName && group.name)) {
      group = {
        name: null,
        pairs: [],
        path: []
      };

      groups.push(group);
    }

    if (blockName) {
      group.name = blockName;
    }

    group.pairs.push({
      block,
      location
    });

    if (blockIndex > 0) {
      group.path.push(blockPath[blockIndex]);
    }
  }

  return {
    groups,
    isLeafBlockTerminal,
    pairs
  };
}
