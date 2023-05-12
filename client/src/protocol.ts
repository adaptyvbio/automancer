import { ChipId, Protocol, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';

import { Host } from './host';
import { BlockContext, GlobalContext } from './interfaces/plugin';


export interface BlockGroup {
  name: string | null;
  pairs: BlockPair[];
  path: ProtocolBlockPath;
}

export interface BlockPair {
  block: ProtocolBlock;
  location: unknown | null;
}


export function createBlockContext(blockPath: ProtocolBlockPath, chipId: ChipId, context: GlobalContext): BlockContext {
  return {
    ...context,
    sendMessage: async (message) => {
      return await context.host.client.request({
        type: 'sendMessageToActiveBlock',
        chipId,
        path: blockPath,
        message
      });
    },
  };
}

export function getBlockImpl(block: ProtocolBlock, context: GlobalContext) {
  return context.host.plugins[block.namespace].blocks[block.name];
}

export function getBlockName(block: ProtocolBlock) {
  return (block.namespace === 'name')
    ? (block['value'] as string)
    : null;
}

export function getCommonBlockPathLength(a: ProtocolBlockPath, b: ProtocolBlockPath) {
  let index: number;

  for (index = 0; index < Math.min(a.length, a.length); index += 1) {
    if (a[index] !== b[index]) {
      break;
    }
  }

  return index;
}

export function getRefPaths(block: ProtocolBlock, location: unknown, context: GlobalContext): ProtocolBlockPath[] {
  let blockImpl = getBlockImpl(block, context);
  let children = blockImpl.getChildren?.(block, context);

  if (!children) {
    return [[]];
  }

  let refs = blockImpl.getChildrenExecution!(block, location, context);

  if (!refs) {
    return [[]];
  }

  return Array.from(refs.entries())
    .filter(([key, ref]) => ref)
    .flatMap(([key, ref]) =>
      getRefPaths(children![key], ref!.location, context).map((path) => [key, ...path])
    );
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
  context: GlobalContext
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

    currentLocation = currentLocation && (currentBlockImpl.getChildrenExecution!(currentBlock, currentLocation, context)?.[key]?.location ?? null);
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
