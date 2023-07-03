import type { DocumentId } from './draft';
import type { RichText } from './rich-text';
import type { Brand } from './util';


export type DiagnosticId = Brand<number, 'DiagnosticId'>;

export type Diagnostic = {
  id: DiagnosticId | null;
  description: RichText | null;
  message: string;
  name: string;
  references: DiagnosticReference[];
  runtimeInfo: null;
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
