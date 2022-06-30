import { Protocol } from './backends/common';


export type DraftId = string;

export interface Draft {
  id: DraftId;
  name: string;
  lastModified: number;
  source: string;

  compiled: {
    errors: {
      message: string;
      range: [number, number] | null;
    }[];
    protocol: Protocol | null;
  } | null;

  location: {
    type: 'host';
  } | {
    type: 'filesystem';
    handle: FileSystemFileHandle;
    path: string;
  } | {
    type: 'memory';
  };
}

export type DraftsRecord = Record<DraftId, Draft>;
