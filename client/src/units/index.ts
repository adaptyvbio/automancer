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

export interface Unit<Matrix> {
  CodeEditor?: { new(): React.Component<{
    chip: Chip;
    draft: Draft;
    model: ChipModel;
    code: any;
    setCode(code: any): void;
  }, unknown> };

  MatrixEditor?: Matrix extends never ? void : MatrixEditorComponent<Matrix>;

  createCode?(protocol: Protocol, model: ChipModel): object;
  createFeatures?(segment: ProtocolSegment, protocol: Protocol, master?: Master): Features;
}


//> Units

export const Units = [
  [Control.namespace, ControlUnit],
  [Input.namespace, InputUnit]
] as [
  [typeof Control.namespace, Unit<Control.Matrix>],
  [typeof Input.namespace, Unit<never>],
]
