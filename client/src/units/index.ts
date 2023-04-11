import * as React from 'react';

import type { Chip, ChipId, ProtocolLocation } from '../backends/common';
import type { Host } from '../host';
import type { Draft } from '../draft';

import { Protocol } from '../interfaces/protocol';


//> Feature

export interface Feature {
  icon: string;
  label: string;
}

export type Features = Feature[];

export interface CreateFeaturesOptions {
  host: Host;
  location?: ProtocolLocation;
  protocol: Protocol;
  segment: ProtocolSegment;
  segmentIndex: number;
}


//> CodeEditor

export interface CodeEditorComponent<Code> {
  new(props: CodeEditorProps<Code>): CodeEditorInstance<Code>;
}

export type CodeEditorInstance<Code> = React.Component<CodeEditorProps<Code>, unknown>;

export interface CodeEditorProps<Code> {
  chip: Chip;
  draft: Draft;
  code: Code;
  host: Host;
  setCode(code: Code): void;
}

export interface Codes {

}


//> MatrixEditor

export interface MatrixEditorComponent {
  new(props: MatrixEditorProps): MatrixEditorInstance;
}

export type MatrixEditorInstance = React.Component<MatrixEditorProps, unknown>;

export interface MatrixEditorProps {
  chip: Chip;
  host: Host;
}


//> ProtocolData & SegmentData

export interface ProtocolData {

}

export interface SegmentData {

}


//> Unit

/** @deprecated */
export interface NavEntry<Props> {
  id: string;
  disabled?: unknown;
  label: string;
  icon: string;
  component: { new(props: Props): React.Component<Props, unknown>; };
}

/** @deprecated */
export interface ChipTabComponentProps {
  chipId: ChipId;
  host: Host;
}

/** @deprecated */
export interface GeneralTabComponentProps {
  host: Host;
}

/** @deprecated */
export interface Unit<Code, Matrix> {
  CodeEditor?: Code extends never ? void : CodeEditorComponent<Code>;
  MatrixEditor?: MatrixEditorComponent;

  namespace: UnitNamespace;
  styleSheets?: CSSStyleSheet[];

  canChipRunProtocol?(protocol: Protocol, chip: Chip): boolean;
  createCode?(protocol: Protocol): Code;
  createFeatures?(options: CreateFeaturesOptions): Features;
  getChipTabs?(chip: Chip): NavEntry<ChipTabComponentProps>[];
  getGeneralTabs?(): NavEntry<GeneralTabComponentProps>[];
  providePreview?(options: { chip: Chip; host: Host; }): string | null;
}
