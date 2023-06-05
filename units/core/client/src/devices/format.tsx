import { Map as ImMap } from 'immutable';
import { Fragment, ReactNode } from 'react';


export type Dimension = 'length' | 'mass' | 'temperature' | 'time';
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
    { long: 'newton', short: 'N' }
  ], [
    Dimensionality({ temperature: 1 }),
    { long: 'kelvin', short: 'K' }
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


export function formatQuantity(value: number, rawDimensionality: RawDimensionality, options: { sign?: boolean; style: 'long' | 'short' }) {
  let valueLog = Math.floor(Math.log10(Math.abs(value)) / 3);
  let prefix = Prefixes[BasePrefixIndex - valueLog];
  let valueScaled = value * (10 ** (-valueLog * 3));

  let dimensionality = Dimensionality(rawDimensionality).filter((factor) => (factor !== 0));
  let unitDef = Units.get(dimensionality)!;

  let magnitudeOutput: ReactNode[] = [];
  let unitOutput: ReactNode[] | null;

  if (valueScaled < 0) {
    magnitudeOutput.push(<Fragment key="0">&minus;&thinsp;</Fragment>);
  } else if (options.sign) {
    magnitudeOutput.push(<Fragment key="0">+&thinsp;</Fragment>);
  }

  magnitudeOutput.push(Math.abs(valueScaled).toFixed(2));

  if (prefix || !dimensionality.isEmpty()) {
    unitOutput = [];

    if (prefix) {
      unitOutput.push(`${prefix[options.style]}`);
    }

    if (unitDef) {
      unitOutput.push(unitDef[options.style]);
    } else {
      for (let [index, [dimension, factor]] of dimensionality.sortBy((factor) => -factor).toArray().entries()) {
        let isFirst = (index === 0);
        let unitDef = Units.get(Dimensionality({ [dimension]: 1 }))!;

        if (!isFirst && (factor !== 1)) {
          unitOutput.push((factor > 0) ? '·' : '/');
        }

        unitOutput.push(unitDef[options.style]);

        if ((factor !== 1) && (isFirst || (factor !== -1))) {
          unitOutput.push(
            <sup key={dimension}>{isFirst ? factor : Math.abs(factor)}</sup>
          );
        }
      }
    }
  } else {
    unitOutput = null;
  }

  return [magnitudeOutput, unitOutput] as const;
}

// console.log(format(2.3451e-6, { length: 2, time: -1 }, { style: 'short' }))
// console.log(format(2.3451e-6, { length: -1, time: 1 }, { style: 'short' }))
// console.log(formatQuantity(50413568 * 8, { }, { style: 'short' }))
