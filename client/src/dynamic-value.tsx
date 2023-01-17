import * as React from 'react';

import { Expression } from './components/expression';


export type DynamicValue = {
  type: 'boolean';
  value: boolean;
} | {
  type: 'ellipsis';
} | {
  type: 'expression';
  contents: string;
} | {
  type: 'number';
  value: number;
} | {
  type: 'quantity';
  formatted: string;
} | {
  type: 'string';
  value: string;
} | {
  type: 'unknown';
};


export function formatDynamicValue(value: DynamicValue) {
  switch (value.type) {
    case 'boolean':
      return value.value ? 'On' : 'Off';
    case 'ellipsis':
      return '–';
    case 'expression':
      return <Expression contents={value.contents} />;
    case 'number':
      return value.value.toString();
    case 'quantity':
      return value.formatted;
    case 'string':
      return value.value;
    case 'unknown':
      return '<unknown>';
    default:
      return '<invalid>';
  }
}
