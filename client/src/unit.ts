import { Chip } from './backends/common';
import { Host } from './host';
import { Master, MasterProcessState, ProtocolBlock, ProtocolBlockAggregate, ProtocolProcess, ProtocolState } from './interfaces/protocol';
import { BlockUnit, FeatureGroupDef, StateUnit, UnknownBlockUnit, UnknownProcessUnit, UnknownUnit } from './interfaces/unit';


/** @deprecated */
export function getBlockExplicitLabel(block: ProtocolBlock, _host: Host): string | null {
  return (block['state']?.['name'] as { value: string | null; } | undefined)?.value ?? null;
}

/** @deprecated */
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

export function getBlockAggregates(blocks: ProtocolBlock[]) {
  let aggregates: ProtocolBlockAggregate[] = [];
  let aggregate: ProtocolBlockAggregate = { blocks: [], offset: 0, state: null };
  let offset = 0;

  for (let block of blocks) {
    let state = UnitTools.getBlockState(block);

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


export namespace UnitTools {
  export function asBlockUnit(unit: UnknownUnit) {
    return 'graphRenderer' in unit
      ? unit as UnknownBlockUnit
      : null;
  }

  export function asProcessUnit(unit: UnknownUnit) {
    return 'createProcessFeatures' in unit
      ? unit as UnknownProcessUnit
      : null;
  }

  export function asStateUnit(unit: UnknownUnit) {
    return isStateUnit(unit) ? unit : null;
  }

  export function isStateUnit(unit: UnknownUnit): unit is StateUnit {
    return 'createStateFeatures' in unit;
  }

  export function getBlockState(block: ProtocolBlock) {
    return (block.namespace === 'state')
      ? (block['state'] as ProtocolState)
      : null;
  }

  export function getBlockStateName(block: ProtocolBlock) {
    let state = getBlockState(block);
    return state && getBlockStateNameFromState(state);
  }

  export function getBlockStateNameFromState(state: ProtocolState) {
    return (state['name'] as { value: string | null; } | undefined)?.value ?? null;
  }

  export function ensureProcessFeatures(features: FeatureGroupDef) {
    return (
      features.length < 1
        ? [{ icon: 'not_listed_location', label: 'Unknown process' }]
        : features
    ).map((feature) => ({ ...feature, accent: true }));
  }
}


export interface MetadataTools {
  archiveChip(host: Host, chip: Chip, value: boolean): Promise<void>;
  getChipMetadata(chip: Chip): { archived: boolean; creationDate: number; title: string; description: string; };
}
