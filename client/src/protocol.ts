import { AnyDurationTerm, DatetimeTerm, DurationTerm, ExperimentId, MasterBlockLocation, Protocol, ProtocolBlock, ProtocolBlockPath, Term, addTerms } from 'pr1-shared';

import { BlockContext, GlobalContext } from './interfaces/plugin';


export interface BlockGroup {
  name: string | null;
  pairs: BlockPair[];
  path: ProtocolBlockPath;
}

export interface BlockPair {
  block: ProtocolBlock;
  location: MasterBlockLocation | null;

  terms: {
    start: Term;
    end: Term;
  } | null;
}


export function createBlockContext(blockPath: ProtocolBlockPath, experimentId: ExperimentId, context: GlobalContext): BlockContext {
  return {
    ...context,
    sendMessage: async (message) => {
      return await context.host.client.request({
        type: 'sendMessageToActiveBlock',
        experimentId,
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
      getRefPaths(children![key].block, ref!.location, context).map((path) => [key, ...path])
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
  rootLocation: MasterBlockLocation | null,
  blockPath: ProtocolBlockPath,
  context: GlobalContext
) {
  let currentBlock = protocol.root;
  let currentLocation = rootLocation;
  let currentSimulated = !rootLocation;
  let currentStartTerm: Term | null = currentLocation
    ? {
      type: 'datetime',
      value: currentLocation?.startDate,
      resolution: 0
    } satisfies DatetimeTerm
    : {
      type: 'duration',
      value: 0,
      resolution: 0
    } satisfies DurationTerm;

  let pairs: BlockPair[] = [{
    block: currentBlock,
    location: currentLocation,

    terms: {
      end: (currentLocation?.term ?? currentBlock.duration),
      start: currentStartTerm
    }
  }];

  let groups: BlockGroup[] = [{
    name: protocol.name,
    pairs: [],
    path: []
  }];

  let isLeafBlockTerminal = false;

  for (let key of blockPath) {
    let currentBlockImpl = getBlockImpl(currentBlock, context);
    let childInfo = currentBlockImpl.getChildren!(currentBlock, context)[key];
    let childLocation = (currentLocation?.children[key] ?? null);

    if (childLocation) {
      currentStartTerm = {
        type: 'datetime',
        resolution: 0,
        value: childLocation.startDate
      } satisfies DatetimeTerm;
    } else if (currentLocation?.childrenTerms[key]) {
      currentStartTerm = currentLocation.childrenTerms[key];
      currentSimulated = true;
    } else if (currentSimulated) {
      currentStartTerm = addTerms(currentStartTerm!, childInfo.delay);
    } else {
      currentStartTerm = null;
    }

    currentBlock = childInfo.block;
    currentLocation = childLocation;

    pairs.push({
      block: currentBlock,
      location: currentLocation,

      terms: currentStartTerm && {
        end: (currentLocation?.term ?? addTerms(currentStartTerm, currentBlock.duration)),
        start: currentStartTerm
      }
    });
  }

  for (let [blockIndex, pair] of pairs.entries()) {
    let isBlockLeaf = (blockIndex === (pairs.length - 1));

    let group = groups.at(-1)!;
    let blockName = getBlockName(pair.block);
    let blockImpl = getBlockImpl(pair.block, context);

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

    group.pairs.push(pair);

    if (blockIndex > 0) {
      group.path.push(blockPath[blockIndex]);
    }
  }

  // console.log({
  //   groups,
  //   isLeafBlockTerminal,
  //   pairs
  // });

  return {
    groups,
    isLeafBlockTerminal,
    pairs
  };
}
