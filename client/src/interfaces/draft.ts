export type HostDraftId = string;

export interface HostDraft {
  id: HostDraftId;
  documents: HostDraftDocument[];
  entryDocumentId: HostDraftDocumentId;
}

export type HostDraftDocumentId = string;

export interface HostDraftDocument {
  id: HostDraftDocumentId;
  contents: string;
  owner: HostDraftDocumentOwner | null;
  path: string;
}

export interface HostDraftDocumentOwner {
  id: string;
  location: string;
}

export interface HostDraftCompilerOptions {
  trusted: boolean;
}
