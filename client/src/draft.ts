import type { Brand, Diagnostic, DiagnosticDocumentReference, Protocol } from 'pr1-shared';


export type DraftId = Brand<string, 'DraftId'>;

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

/** @deprecated */
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

export interface DraftMarker {
  kind: 'deprecated' | 'unnecessary';
  message: string;
  reference: DiagnosticDocumentReference;
}

export interface DraftRelation {
  definitionBody: DiagnosticDocumentReference;
  definitionName: DiagnosticDocumentReference;
  references: DiagnosticDocumentReference[];
}

export interface DraftRename {
  items: DiagnosticDocumentReference[];
}

export type DraftSelection = DraftRange;

export interface DraftToken {
  name: string;
  reference: DiagnosticDocumentReference;
}

export interface DraftMarker {
  kind: 'deprecated' | 'unnecessary';
  message: string;
  reference: DiagnosticDocumentReference;
}

export interface DraftToken {
  name: string;
  reference: DiagnosticDocumentReference;
}

export interface DraftCompilation {
  analysis: {
    completions: DraftCompletion[];
    errors: Diagnostic[];
    folds: DraftFold[];
    hovers: DraftHover[];
    markers: DraftMarker[];
    relations: DraftRelation[];
    renames: DraftRename[];
    selections: DraftSelection[];
    tokens: DraftToken[];
    warnings: Diagnostic[];
  };

  documentPaths: string[];
  protocol: Protocol | null;
  valid: boolean;
}

/** @deprecated */
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

/** @deprecated */
export interface DraftPrimitive {
  name?: string | null;
  source?: string;
}
