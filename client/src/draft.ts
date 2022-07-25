import { DraftItem } from './app-backends/base';
import { Protocol } from './backends/common';


export type DraftId = string;

export interface Draft {
  id: DraftId;
  item: DraftItem;
  compiled: {
    errors: {
      message: string;
      range: [number, number] | null;
    }[];
    protocol: Protocol | null;
  } | null;
}

export interface DraftPrimitive {
  name?: string | null;
  source?: string;
}

export type DraftsRecord = Record<DraftId, Draft>;
