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

export async function getDraftEntrySource(entry: DraftEntry): Promise<string | null> {
  switch (entry.location.type) {
    case 'app':
      return entry.location.source;
    case 'filesystem': {
      let file;

      try {
        await entry.location.handle.requestPermission();
      } catch (err) {
        if ((err as { name: string; }).name !== 'SecurityError') {
          throw err;
        }
      }

      try {
        file = await entry.location.handle.getFile();
      } catch (err) {
        if ((err as { name: string; }).name === 'NotAllowedError') {
          return null;
        }

        throw err;
      }

      return await file.text();
    }
    default:
      return '# Missing';
  }
}
