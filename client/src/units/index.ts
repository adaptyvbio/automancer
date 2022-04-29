import * as React from 'react';

import * as Control from './control';
import * as Input from './input';
import type { Chip, ChipModel, Draft, Master, Protocol, ProtocolSegment } from '../backends/common';


export interface Feature {
  icon: string;
  label: string;
}

export type Features = Feature[];


interface Unit {
  CodeEditor?: { new(): React.Component<{
    chip: Chip;
    draft: Draft;
    model: ChipModel;
    code: any;
    setCode(code: any): void;
  }, unknown> };
  createCode?(protocol: Protocol, model: ChipModel): object;
  createFeatures?(segment: ProtocolSegment, protocol: Protocol, master?: Master): Features;
}


interface Units {
  [Control.namespace]: typeof Control,
  [Input.namespace]: typeof Input
}

export interface UnitsCode {
  // [namespace in keyof Units]: ReturnType<Units[namespace]['createCode']>;
  control: ReturnType<Units[typeof Control.namespace]['createCode']>;
}

export interface UnitsCodeEditor  {
  control: Units[typeof Control.namespace]['CodeEditor'];
};

export default [
  [Control.namespace, Control],
  [Input.namespace, Input]
] as [string, Unit][];
