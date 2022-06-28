import * as React from 'react';

import ControlUnit from './control';
import * as Control from './control';

import InputUnit from './input';
import * as Input from './input';

import type { Chip, ChipModel, Master, Protocol, ProtocolSegment } from '../backends/common';
import type { Draft, Host } from '../application';


//> Feature

export interface Feature {
  icon: string;
  label: string;
}

export type Features = Feature[];


//> CodeEditor

export interface CodeEditorComponent<Code> {
  new(props: CodeEditorProps<Code>): CodeEditorInstance<Code>;
}

export type CodeEditorInstance<Code> = React.Component<CodeEditorProps<Code>, unknown>;

export interface CodeEditorProps<Code> {
  chip: Chip;
  draft: Draft;
  model: ChipModel;
  code: Code;
  setCode(code: Code): void;
}

export interface Codes {
  [Control.namespace]: Control.Code;
}


//> MatrixEditor

export interface MatrixEditorComponent<Matrix> {
  new(props: MatrixEditorProps<Matrix>): MatrixEditorInstance<Matrix>;
}

export type MatrixEditorInstance<Matrix> = React.Component<MatrixEditorProps<Matrix>, unknown>;

export interface MatrixEditorProps<Matrix> {
  chip: Chip;
  host: Host;
  model: ChipModel;
  matrix: Matrix;
  setMatrix(matrix: Matrix): void;
}

export interface Matrices {
  [Control.namespace]: Control.Matrix;
}


//> Unit

export interface Unit<Code, Matrix> {
  CodeEditor?: Code extends never ? void : CodeEditorComponent<Code>;
  MatrixEditor?: Matrix extends never ? void : MatrixEditorComponent<Matrix>;

  createCode?(protocol: Protocol, model: ChipModel): object;
  createFeatures?(segment: ProtocolSegment, protocol: Protocol, master?: Master): Features;
}


//> Units

export const Units = [
  [Control.namespace, ControlUnit],
  [Input.namespace, InputUnit]
] as [
  [typeof Control.namespace, Unit<Control.Code, Control.Matrix>],
  [typeof Input.namespace, Unit<never, never>],
]
