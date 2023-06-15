import type { DraftDocumentId } from '../app-backends/base';
import type { DraftCompletion, DraftDiagnostic, DraftFold, DraftHover, DraftRelation, DraftRename, DraftSelection } from '../draft';
import type { Protocol } from './protocol';


export type HostDraftId = string;

export interface HostDraft {
  id: HostDraftId;
  documents: HostDraftDocument[];
}

export type HostDraftDocumentId = string;

export interface HostDraftDocument {
  id: HostDraftDocumentId;
  contents: string | null;
  path: string[] | null;
}

export interface HostDraftCompilerOptions {
  trusted: boolean;
}


export interface HostDraftCompilerResult {
  documents: Record<DraftDocumentId, {
    analysis: DraftLanguageAnalysis;
  }>;
  missingDocumentPaths: string[][];
  protocol: Protocol | null;
  valid: boolean;
}


export interface DraftLanguageAnalysis {
  completions: DraftCompletion[];
  diagnostics: DraftDiagnostic[];
  folds: DraftFold[];
  hovers: DraftHover[];
  relations: DraftRelation[];
  renames: DraftRename[];
  selections: DraftSelection[];
}
