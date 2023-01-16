import * as React from 'react';

import { Expression } from './components/expression';


export type DynamicValue = {
  type: 'quantity';
  formatted: string;
} | {
  type: 'expression';
  contents: string;
};


export function formatDynamicValue(value: DynamicValue) {
  switch (value.type) {
    case 'quantity':
      return value.formatted;
    case 'expression':
      return <Expression contents={value.contents} />;
  }
}
