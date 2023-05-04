import { Protocol, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';

import { Host } from './host';


export interface BlockGroup {
  blocks: ProtocolBlock[];
  name: string | null;
  path: ProtocolBlockPath;
}


export function getBlockImpl(block: ProtocolBlock, options: { host: Host; }) {
  return options.host.plugins[block.namespace].blocks[block.name];
}


export function getBlockName(block: ProtocolBlock) {
  return (block.namespace === 'name')
    ? (block.value as string)
    : null;
}


export function analyzeBlockPath(protocol: Protocol, blockPath: ProtocolBlockPath, options: { host: Host; }) {
  let blocks: ProtocolBlock[] = [protocol.root];
  let groups: BlockGroup[] = [{
    blocks: [],
    name: protocol.name,
    path: []
  }];
  let isLeafBlockTerminal = false;


  let currentBlock = protocol.root;

  for (let key of blockPath) {
    let currentBlockImpl = getBlockImpl(currentBlock, { host: options.host });
    currentBlock = currentBlockImpl.getChild!(currentBlock, key);
    blocks.push(currentBlock);
  }

  for (let [blockIndex, block] of blocks.entries()) {
    let isBlockLeaf = (blockIndex === (blocks.length - 1));

    let group = groups.at(-1);
    let blockName = getBlockName(block);
    let blockImpl = getBlockImpl(block, { host: options.host });

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
