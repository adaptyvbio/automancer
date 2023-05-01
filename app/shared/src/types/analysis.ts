export interface Diagnostic {
  description: string[];
  id: string | null;
  message: string;
  name: string;
  references: DiagnosticReference[];
  trace: (DiagnosticReference[]) | null;
}


export type DiagnosticReference = DiagnosticDocumentReference | DiagnosticFileReference;

export interface DiagnosticBaseReference {
  type: string;
  id: string | null;
  label: string | null;
}

export type DiagnosticDocumentReference = DiagnosticBaseReference & {
  type: 'document';
  documentId: string;
  ranges: [number, number][]; // DraftRange[]
}

export type DiagnosticFileReference = DiagnosticBaseReference & {
  type: 'file';
  path: string;
}
