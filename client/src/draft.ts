import { DraftItem } from './app-backends/base';
import { Protocol } from './backends/common';


export type DraftId = string;

export type DraftLocation = DraftRange[];
export type DraftRange = [number, number];

export interface DraftError {
  message: string;
  range: DraftRange | null; // DraftLocation | null;
}

export interface DraftHover {
  contents: string[];
  range: DraftRange;
}

export type DraftWarning = DraftError;

export interface DraftCompilation {
  errors: DraftError[];
  // diagnostics: {
  //   errors: DraftError[];
  //   hovers: DraftHover[];
  //   warnings: DraftWarning[];
  // } | null;
  invalid: boolean;
  protocol: Protocol | null;
  revision: number; // Modification time of the source file this compilation corresponds to.
}

export interface Draft {
  id: DraftId;
  compilation: DraftCompilation | null;
  compilationId: number | null;
  item: DraftItem;
  lastModified: number | null; // Last modification time.
  name: string | null;
  readable: boolean;
  revision: number; // Last modification time through another editor.
  writable: boolean;

  meta: {
    compilationId: number | null; // Time when the last compilation started.
    compilationSourceLastModified: number | null; // Modification time of the last compilation started.
  };
}

export interface DraftPrimitive {
  name?: string | null;
  source?: string;
}

export type DraftsRecord = Record<DraftId, Draft>;
