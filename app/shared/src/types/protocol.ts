import type { DocumentId, DraftId } from './draft';
import type { PluginName } from './plugin';
import type { Brand } from './util';


export interface Protocol {
  draft: {
    id: DraftId;
    documents: {
      id: DocumentId;
    }[];
    entryDocumentId: DocumentId;
  };
  name: string | null;
  root: ProtocolBlock;
}

export interface ProtocolBlock {
  duration: AnyDurationTerm;
  name: ProtocolBlockName;
  namespace: PluginName;

  [key: string]: unknown;
}

export type ProtocolBlockName = Brand<string, 'ProtocolBlockName'>;
export type ProtocolBlockPath = number[];

export interface ProtocolProcess {
  data: unknown;
  namespace: PluginName;
}


export interface DatetimeTerm {
  type: 'datetime';
  resolution: number;
  value: number;
}

export interface DurationTerm {
  type: 'duration';
  resolution: number;
  value: number;
}

export interface ForeverTerm {
  type: 'forever';
}

export interface UnknownTerm {
  type: 'unknown';
}

export type AnyDurationTerm = DurationTerm | ForeverTerm | UnknownTerm;
export type Term = DatetimeTerm | DurationTerm | ForeverTerm | UnknownTerm;
