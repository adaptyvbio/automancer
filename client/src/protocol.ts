import { DatetimeTerm, DurationTerm, Experiment, MasterBlockLocation, Protocol, ProtocolBlock, ProtocolBlockPath, Term, addTerms, createErrorWithCode } from 'pr1-shared';

import { HostDraftMark } from './interfaces/draft';
import { BlockContext, GlobalContext } from './interfaces/plugin';


export interface BlockGroup {
  firstPairIndex: number;
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


export function createBlockContext(blockPath: ProtocolBlockPath, experiment: Experiment, context: GlobalContext): BlockContext {
  return {
    ...context,
    experiment,
    sendMessage: async (message) => {
      return await context.host.client.request({
        type: 'sendMessageToActiveBlock',
        experimentId: experiment.id,
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

export function getRefPaths(block: ProtocolBlock, location: MasterBlockLocation, context: GlobalContext): ProtocolBlockPath[] {
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
 *  2. Certain blocks known as _sparse_ blocks, especially those which require custom graph rendering such as `sequence` and `parallel` blocks, are always at the end of their group. After such a block is encountered, a new group is created.
 *  3. A block is _terminal_ if it contains no children, regardless of whether the target block is that block or one its children.
 *  4. The leaf block is the target block, as specified by the path provided as an argument.
 *  5. If the leaf block is terminal, the last group does not countain that block.
 */
export function analyzeBlockPath(
  protocol: Protocol,
  rootLocation: MasterBlockLocation | null,
  rootMark: HostDraftMark | null,
  blockPath: ProtocolBlockPath,
  context: GlobalContext
) {
  let currentBlock = protocol.root;
  let currentLocation = rootLocation;
  let currentMark = rootMark;
  let currentSimulated = !rootLocation && !rootMark;
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
      end: (currentMark?.term ?? currentLocation?.term ?? currentBlock.duration),
      start: currentStartTerm
    }
  }];

  for (let key of blockPath) {
    let currentBlockImpl = getBlockImpl(currentBlock, context);
    let childInfo = currentBlockImpl.getChildren?.(currentBlock, context)[key];

    if (!childInfo) {
      throw createErrorWithCode('Invalid block path', 'INVALID_BLOCK_PATH');
    }

    let childLocation = (currentLocation?.children[key] ?? null);

    let childMark = (currentMark?.childrenMarks[key] ?? null);
    let isLocationValid = !rootMark || childMark;

    if (childLocation && isLocationValid) {
      currentStartTerm = {
        type: 'datetime',
        resolution: 0,
        value: childLocation.startDate
      } satisfies DatetimeTerm;
    } else if (currentMark?.childrenOffsets[key]) {
      currentStartTerm = currentMark.childrenOffsets[key];
      currentSimulated = true;
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
    currentMark = childMark;

    pairs.push({
      block: currentBlock,
      location: currentLocation,

      terms: currentStartTerm && {
        end: (currentMark?.term ?? (isLocationValid ? currentLocation?.term : null) ?? addTerms(currentStartTerm, currentBlock.duration)),
        start: currentStartTerm
      }
    });
  }

  let groups: BlockGroup[] = [];
  let isLeafBlockTerminal = false;
  let sparse = false;

  for (let [blockIndex, pair] of pairs.entries()) {
    let isBlockLeaf = (blockIndex === (pairs.length - 1));

    let group = groups.at(-1);
    let blockName = getBlockName(pair.block);
    let blockImpl = getBlockImpl(pair.block, context);

    if (isBlockLeaf && !blockImpl.getChildren) {
      isLeafBlockTerminal = true;
      continue;
    }

    if (sparse || !group || (blockName && group.name)) {
      group = {
        firstPairIndex: blockIndex,
        name: null,
        pairs: [],
        path: []
      };

      groups.push(group);
    }

    sparse = !!blockImpl.computeGraph;

    if (blockName) {
      group.name = blockName;
    }

    group.pairs.push(pair);

    if (blockIndex > 0) {
      group.path.push(blockPath[blockIndex]);
    }
  }

  groups[0].name ??= protocol.name;

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
