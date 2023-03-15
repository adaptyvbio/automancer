import * as React from 'react';

import { Expression } from './components/expression';
import { formatDuration } from './format';
import * as util from './util';


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
  magnitude: number;
  dimensionality: Record<`[${string}]`, number>;
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
      if (util.deepEqual(value.dimensionality, { '[time]': 1 })) {
        return formatDuration(value.magnitude);
      }

      return <span dangerouslySetInnerHTML={{ __html: value.formatted }} />;
    case 'string':
      return value.value;
    case 'unknown':
      return '<unknown>';
    default:
      return '<invalid>';
  }
}
