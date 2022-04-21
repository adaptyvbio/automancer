import * as React from 'react';

import * as Control from './control';
import type { Protocol } from '../backends/common';


interface Unit {
  CodeEditor: React.Component;
  createCode(protocol: Protocol): object;
}


interface Units {
  control: typeof Control
}

export type UnitsCode = {
  [namespace in keyof Units]: ReturnType<Units[namespace]['createCode']>;
}

export type UnitsCodeEditor = {
  [namespace in keyof Units]: Units[namespace]['CodeEditor'];
};

export default [['control', Control]] as [['control', typeof Control]];
