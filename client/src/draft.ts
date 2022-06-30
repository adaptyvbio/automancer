import { DraftEntry } from './app-backend';
import { Protocol } from './backends/common';


export type DraftId = string;

export interface Draft {
  id: DraftId;
  entry: DraftEntry;
  compiled: {
    errors: {
      message: string;
      range: [number, number] | null;
    }[];
    protocol: Protocol | null;
  } | null;
}

export interface DraftPrimitive {
  id: DraftId;
  source: string;
}

export type DraftsRecord = Record<DraftId, Draft>;

export async function getDraftEntrySource(entry: DraftEntry): Promise<string> {
  switch (entry.location.type) {
    case 'app':
      return entry.location.source;
    default:
      return '# Missing';
  }
}
