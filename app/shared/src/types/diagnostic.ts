import { DocumentId } from './draft';


export type Diagnostic = {
  id: string | null;
  description: string[];
  message: string;
  name: string;
  references: DiagnosticReference[];
  trace: DiagnosticReference[] | null;
} & ({
  type: 'default';
} | {
  type: 'timed';
  date: number;
});

export type DiagnosticReference = DiagnosticDocumentReference | DiagnosticFileReference;

export interface DiagnosticBaseReference {
  type: string;
  id: string | null;
  label: string | null;
}

export type DiagnosticDocumentReference = DiagnosticBaseReference & {
  type: 'document';
  documentId: DocumentId;
  ranges: [number, number][];
}

export type DiagnosticFileReference = DiagnosticBaseReference & {
  type: 'file';
  path: string;
}
