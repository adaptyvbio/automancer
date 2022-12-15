import { Chip } from './backends/common';
import { Host } from './host';
import { Master, MasterProcessState, ProtocolBlock, ProtocolBlockAggregate, ProtocolProcess, ProtocolState } from './interfaces/protocol';


/**
 * @deprecated
 */
export function getBlockExplicitLabel(block: ProtocolBlock, _host: Host): string | null {
  return (block.state?.['name'] as { value: string | null; } | undefined)?.value ?? null;
}

export function getBlockLabel(block: ProtocolBlock, location: unknown | null, host: Host) {
  let unit = host.units[block.namespace];

  let explicitLabel = getBlockExplicitLabel(block, host);

  let value = explicitLabel
    ?? unit.getBlockDefaultLabel?.(block, host)
    ?? 'Block';

  return {
    explicit: !!explicitLabel,
    suffix: location
      ? unit.getBlockLocationLabelSuffix?.(block, location)
      : null,
    value
  };
}

export function getSegmentBlockProcessData(block: ProtocolBlock, _host: Host): ProtocolProcess | null {
  return block.namespace === 'segment'
    ? block['process'] as ProtocolProcess
    : null;
}

export function getSegmentBlockProcessState(state: unknown, _host: Host): MasterProcessState {
  return (state as { process: MasterProcessState; }).process;
}

export function getBlockState(block: ProtocolBlock) {
  return (block.namespace === 'state')
    ? (block['state'] as ProtocolState)
    : null;
}

export function getBlockStateName(state: ProtocolState) {
  return (state['name'] as { value: string | null; } | undefined)?.value ?? null;
}

export function getBlockAggregates(blocks: ProtocolBlock[]) {
  let aggregates: ProtocolBlockAggregate[] = [];
  let aggregate: ProtocolBlockAggregate = { blocks: [], offset: 0, state: null };
  let offset = 0;

  for (let block of blocks) {
    let state = getBlockState(block);

    if (state) {
      if (aggregate.blocks.length > 0) {
        aggregates.push(aggregate);
      }

      offset += aggregate.blocks.length;
      aggregate = { blocks: [], offset, state };
    }

    aggregate.blocks.push(block);
  }

  if (aggregate.blocks.length > 0) {
    aggregates.push(aggregate);
  }

  return aggregates;
}


export interface MetadataTools {
  archiveChip(host: Host, chip: Chip, value: boolean): Promise<void>;
  getChipMetadata(chip: Chip): { archived: boolean; creationDate: number; title: string; description: string; };
}
