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
}

export interface Draft {
  id: DraftId;
  compilation: DraftCompilation | null;
  item: DraftItem;
  lastModified: number | null;
  name: string | null;
  readable: boolean;
  revision: number;
  writable: boolean;
}

export interface DraftPrimitive {
  name?: string | null;
  source?: string;
}

export type DraftsRecord = Record<DraftId, Draft>;
