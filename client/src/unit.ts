import { Chip } from './backends/common';
import { Host } from './host';
import { ProtocolBlock, ProtocolProcess } from './interfaces/protocol';


export function getBlockExplicitLabel(block: ProtocolBlock, host: Host): string | null {
  return (block.state?.['name'] as { value: string | null; } | undefined)?.value ?? null;
}

export function getBlockProcess(block: ProtocolBlock, host: Host): ProtocolProcess | null {
  return block.namespace === 'segment'
    ? block['process'] as ProtocolProcess
    : null;
}


export interface MetadataTools {
  archiveChip(host: Host, chip: Chip, value: boolean): Promise<void>;
  getChipMetadata(chip: Chip): { archived: boolean; creationDate: number; title: string; description: string; };
}
