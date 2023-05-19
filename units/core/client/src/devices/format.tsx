import { Map as ImMap } from 'immutable';
import { Fragment, ReactNode } from 'react';


export type Dimension = 'byte' | 'length' | 'mass' | 'time';
export type RawDimensionality = Partial<Record<Dimension, number>>;
export type Dimensionality = ImMap<Dimension, number>;
export const Dimensionality = ImMap<Dimension, number>;

export interface UnitDef {
  long: string;
  short: string;
}

export const Units = ImMap<Dimensionality, UnitDef>([
  [
    Dimensionality({ length: 1 }),
    { long: 'meter', short: 'm' }
  ], [
    Dimensionality({ time: -1 }),
    { long: 'hertz', short: 'Hz' }
  ], [
    Dimensionality({ time: 1 }),
    { long: 'second', short: 's' }
  ], [
    Dimensionality({ mass: 1 }),
    { long: 'gram', short: 'g' }
  ], [
    Dimensionality({ length: -1, mass: 1, time: -2 }),
    { long: 'pascal', short: 'Pa' }
  ], [
    Dimensionality({ length: 1, mass: 1, time: -2 }),
    { long: 'Newton', short: 'N' }
  ], [
    Dimensionality({ byte: 1 }),
    { long: 'byte', short: 'B' }
  ]
]);


export const BasePrefixIndex = 10;
export const Prefixes = [
  { long: 'quetta', short: 'Q' },
  { long: 'ronna', short: 'R' },
  { long: 'yotta', short: 'Y' },
  { long: 'zetta', short: 'Z' },
  { long: 'exa', short: 'E' },
  { long: 'peta', short: 'P' },
  { long: 'tera', short: 'T' },
  { long: 'giga', short: 'G' },
  { long: 'mega', short: 'M' },
  { long: 'kilo', short: 'k' },
  null,
  { long: 'milli', short: 'm' },
  { long: 'micro', short: 'µ' },
  { long: 'nano', short: 'n' },
  { long: 'pico', short: 'p' },
  { long: 'femto', short: 'f' },
  { long: 'atto', short: 'a' },
  { long: 'zepto', short: 'z' },
  { long: 'yocto', short: 'y' },
  { long: 'ronto', short: 'r' },
  { long: 'quecto', short: 'q' }
];


export function formatQuantity(value: number, rawDimensionality: RawDimensionality, options: { style: 'long' | 'short' }): ReactNode {
  let valueLog = Math.floor(Math.log10(Math.abs(value)) / 3);
  let prefix = Prefixes[BasePrefixIndex - valueLog];
  let valueScaled = value * (10 ** (-valueLog * 3));

  let dimensionality = Dimensionality(rawDimensionality).filter((factor) => (factor !== 0));
  let unitDef = Units.get(dimensionality)!;

  let output: ReactNode[] = [];

  if (valueScaled < 0) {
    output.push(<Fragment key="0">&minus;&thinsp;</Fragment>);
  }

  output.push(Math.abs(valueScaled).toFixed(2));

  if (prefix || !dimensionality.isEmpty()) {
    output.push(<Fragment key="1">&nbsp;</Fragment>);
  }

  if (prefix) {
    output.push(`${prefix[options.style]}`);
  }

  if (unitDef) {
    output.push(unitDef[options.style]);
  } else {
    for (let [index, [dimension, factor]] of dimensionality.sortBy((factor) => -factor).toArray().entries()) {
      let isFirst = (index === 0);
      let unitDef = Units.get(Dimensionality({ [dimension]: 1 }))!;

      if (!isFirst && (factor !== 1)) {
        output.push((factor > 0) ? '·' : '/');
      }

      output.push(unitDef[options.style]);

      if ((factor !== 1) && (isFirst || (factor !== -1))) {
        output.push(
          <sup key={dimension}>{isFirst ? factor : Math.abs(factor)}</sup>
        );
      }
    }
  }

  return output;
}

// console.log(format(2.3451e-6, { length: 2, time: -1 }, { style: 'short' }))
// console.log(format(2.3451e-6, { length: -1, time: 1 }, { style: 'short' }))
// console.log(formatQuantity(50413568 * 8, { }, { style: 'short' }))
