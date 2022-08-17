import * as React from 'react';

import type { Chip, ChipId, Protocol, ProtocolLocation, ProtocolSegment } from '../backends/common';
import type { Host } from '../host';
import type { Draft } from '../draft';

import ControlUnit from './control';
import * as Control from './control';

import InputUnit from './input';
import * as Input from './input';

import LocalNotificationUnit from './local-notification';
import * as LocalNotification from './local-notification';

import TimerUnit from './timer';
import * as Timer from './timer';
import { Route } from '../application';


//> Feature

export interface Feature {
  icon: string;
  label: string;
}

export type Features = Feature[];

export interface CreateFeaturesOptions {
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
  [Control.namespace]: Control.Code;
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

export interface Matrices {
  [Control.namespace]: Control.Matrix;
}


//> ExecutorState

export interface ExecutorStates {
  [Control.namespace]: Control.ExecutorState;
}


//> ProtocolData & SegmentData

export interface ProtocolData {
  [Control.namespace]: Control.ProtocolData;
}

export interface SegmentData {
  [Control.namespace]: Control.SegmentData;
  [Input.namespace]?: Input.SegmentData;
  [LocalNotification.namespace]?: LocalNotification.SegmentData;
  [Timer.namespace]?: Timer.SegmentData;
}


//> OperatorLocationData

export interface OperatorLocationData {
  [Input.namespace]: Timer.OperatorLocationData;
  [Timer.namespace]: Timer.OperatorLocationData;
}


//> Unit

interface NavEntry<Props> {
  id: string;
  disabled?: unknown;
  label: string;
  icon: string;
  component: { new(props: Props): React.Component<Props, unknown>; };
}

export interface ChipTabComponentProps {
  chipId: ChipId;
  host: Host;
  setRoute(route: Route): void;
}

export interface GeneralTabComponentProps {
  host: Host;
  setRoute(route: Route): void;
}

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


//> UnitInfo

export interface UnitInfo {
  development: boolean;
  enabled: boolean;
  namespace: string;
  version: number;

  metadata: {
    author: string | null;
    description: string | null;
    license: string | null;
    title: string | null;
    url: string | null;
    version: string | null;

    icon: {
      kind: 'bitmap' | 'icon' | 'svg';
      value: string;
    } | null;
  };
}

export type UnitNamespace = string;


//> Units

// TODO: deprecate
export const Units = [];
