import { DraftItem } from './app-backends/base';
import { Protocol } from './backends/common';


export type DraftId = string;

export type DraftLocation = DraftRange[];
export type DraftRange = [number, number];

export interface DraftCompletion {
  items: {
    documentation: string | null;
    // kind: 'class' | 'constant'| 'enum' | 'field' | 'file' | 'function' | 'interface' | 'keyword' | 'method' | 'module' | 'property' | 'snippet' | 'text' | 'type' | 'unit' | 'value';
    kind: 'class' | 'constant' | 'enum' | 'field' | 'property';
    label: string;
    namespace: string | null;
    signature: string | null;
    sublabel: string | null;
    text: string;
  }[];
  ranges: DraftRange[];
}

export interface DraftDiagnostic {
  kind: 'error' | 'warning';
  message: string;
  ranges: DraftRange[];
}

export interface DraftHover {
  contents: string[];
  range: DraftRange;
}

export interface DraftFold {
  kind: string;
  range: DraftRange;
}

export interface DraftCompilation {
  completions: DraftCompletion[];
  diagnostics: DraftDiagnostic[];
  folds: DraftFold[];
  hovers: DraftHover[];

  protocol: Protocol | null;
  valid: boolean;
}

export interface Draft {
  id: DraftId;
  compilation: DraftCompilation | null;
  item: DraftItem;
  lastModified: number | null; // Last modification time.
  name: string | null;
  readable: boolean;
  revision: number; // Last modification time through another editor.
  writable: boolean;

  meta: {
    compilationTime: number | null; // Time when the last compilation started.
  };
}

export interface DraftPrimitive {
  name?: string | null;
  source?: string;
}

export type DraftsRecord = Record<DraftId, Draft>;


export function createDraftFromItem(draftItem: DraftItem): Draft {
  return {
    id: draftItem.id,
    compilation: null,
    item: draftItem,
    lastModified: draftItem.lastModified,
    name: draftItem.name,
    readable: draftItem.readable,
    revision: draftItem.revision,
    writable: draftItem.writable,

    meta: {
      compilationTime: null
    }
  };
}
