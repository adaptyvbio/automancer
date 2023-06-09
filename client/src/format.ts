import { AnyDurationTerm } from 'pr1-shared';
import { ReactNode, createElement } from 'react';


export interface TimeUnit {
  factor: number;
  narrow: string;
  short: string;
  long: string;
}

export const TIME_UNITS: TimeUnit[] = [
  { factor: 1, narrow: 'ms', short: 'msec', long: 'millisecond' },
  { factor: 1000, narrow: 's', short: 'sec', long: 'second' },
  { factor: 60e3, narrow: 'm', short: 'min', long: 'minute' },
  { factor: 3600e3, narrow: 'h', short: 'hr', long: 'hour' },
  { factor: 3600e3 * 24, narrow: 'd', short: 'day', long: 'day' },
  { factor: 3600e3 * 24 * 7, narrow: 'w', short: 'week', long: 'week' }
];


/**
 * Formats a duration.
 *
 * To be replaced with [`Intl.DurationFormat`](https://github.com/tc39/proposal-intl-duration-format) once stable.
 *
 * @param input The duration, in milliseconds.
 * @param resolution The smallest fraction of the input to display. Defaults to `0.01` (1%).
 * @param options.style The duration's style: `long` (`1 hour and 40 minutes`), `short` (`1 hr 40 min`), `narrow` (`1h 40m`) or `numeric` (`01:40`).
 */
export function formatDuration(input: number, options?: {
  range?: number;
  resolution?: number;
  style?: ('long' | 'narrow' | 'numeric' | 'short');
}) {
  let range = (options?.range ?? input);
  let style = (options?.style ?? 'short');

  let inputRest = Math.round(input);
  let rangeRest = Math.round(range);
  let resolution = inputRest * (options?.resolution ?? 0.01);

  let units = (style !== 'numeric')
    ? TIME_UNITS.slice()
    : TIME_UNITS.slice(1, 4);

  let segments: string[] = [];

  for (let unit of units.reverse()) {
    let withinResolution = inputRest > resolution;

    let unitInputValue = Math.floor(inputRest / unit.factor);
    let unitRangeValue = Math.floor(rangeRest / unit.factor);

    inputRest %= unit.factor;
    rangeRest %= unit.factor;

    if (style === 'numeric') {
      if ((unitRangeValue > 0) || TIME_UNITS.slice(1, 3).includes(unit)) {
        segments.push(unitInputValue.toFixed().padStart(2, '0'));
      }
    } else {
      if ((unitRangeValue > 0) && withinResolution) {
        segments.push(unitInputValue.toFixed() + ((style !== 'narrow') ? ' ' : '') + unit[style] + ((style === 'long') && (unitInputValue > 1) ? 's' : ''));
      }
    }
  }

  switch (style) {
    case 'numeric':
      return segments.join(':');
    case 'long':
      return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(segments);
    case 'narrow':
    case 'short':
      return new Intl.ListFormat('en', { style: 'narrow', type: 'unit' }).format(segments);
  }
}


const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  localeMatcher: 'best fit',
  numeric: 'auto',
  style: 'long'
});


const timeDivisions: {
  amount: number;
  name: Intl.RelativeTimeFormatUnit;
}[] = [
  { amount: 60, name: 'seconds' },
  { amount: 60, name: 'minutes' },
  { amount: 24, name: 'hours' },
  { amount: 7, name: 'days' },
  { amount: 4.34524, name: 'weeks' },
  { amount: 12, name: 'months' },
  { amount: Infinity, name: 'years' }
];

export function formatRelativeDate(date: Date | number): string {
  let duration = (new Date(date).getTime() - Date.now()) / 1000;

  for (let division of timeDivisions) {
    if (Math.abs(duration) < division.amount) {
      return relativeTimeFormatter.format(Math.round(duration), division.name);
    }

    duration /= division.amount;
  }

  throw new Error();
}

export function formatRelativeTime(input: number): string {
  let seconds = Math.round(input / 1000);
  let minutes = Math.floor(seconds / 60) % 60;
  let hours = Math.floor(seconds / 3600);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}


/**
 * Formats an absolute time.
 *
 * @param input The time, in milliseconds.
 * @param options.ref A reference time used to indicate the time's day difference.
 */
export function formatAbsoluteTime(input: number, options?: { ref?: number | null; }): ReactNode {
  let date = new Date(input);

  let ref = (options?.ref ?? Date.now());
  let midnight = new Date(ref);
  midnight.setHours(0, 0, 0, 0);

  let dayDifference = (ref !== null)
    ? Math.floor((input - midnight.getTime()) / 24 / 3600e3)
    : 0;

  return [
    `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
    (dayDifference !== 0)
      ? createElement('sup', { key: 0 }, [
        (dayDifference > 0) ? '+' : '\u2212', // &minus;
        Math.abs(dayDifference).toFixed(0)
      ])
      : null
  ];
}


/**
 * Formats a pair of absolute times.
 *
 * @param a The first time, in milliseconds.
 * @param b The second time, in milliseconds.
 * @param options.mode The mode to use, either `directional` (`10:00 → 11:00`) or `range` (`10:00 – 11:00`).
 */
export function formatAbsoluteTimePair(a: number, b: number | null, options?: {
  mode?: 'directional' | 'range';
  ref?: number | null;
}): ReactNode {
  let symbol = {
    directional: '\u2192', // &rarr;
    range: '\u2013' // &ndash;
  }[options?.mode ?? 'range'];

  if (b !== null) {
    let diff = Math.abs(b - a);

    if (diff < 60e3) {
      return formatAbsoluteTime(a);
    }
  }

  return [
    formatAbsoluteTime(a, { ref: (options?.ref ?? null) }),
    '\xa0',
    symbol,
    ...((b !== null)
      ? [
        ' ',
        formatAbsoluteTime(b, { ref: (options?.ref ?? null) })
      ]
      : [])
  ];
}


export function formatDurationTerm(term: AnyDurationTerm): ReactNode {
  switch (term.type) {
    case 'duration':
      return formatDuration(term.value);
    case 'forever':
      return '\u221e'; // &infin;
    case 'unknown':
      return null;
  }
}


export function formatRemainingTime(input: number, options?: { style?: 'long' | 'short'; }): ReactNode {
  if (input < 60e3) {
    return 'Less than a minute left';
  }

  let style = (options?.style ?? 'short');

  let inputRest = Math.round(input);

  let segments: string[] = [];

  for (let unit of TIME_UNITS.slice().reverse()) {
    let potentialInputRest = inputRest % unit.factor;
    let unitInputValue: number;

    if (potentialInputRest < 60e3) {
      unitInputValue = Math.round(inputRest / unit.factor);
      inputRest = 0;
    } else {
      unitInputValue = Math.floor(inputRest / unit.factor);
      inputRest = potentialInputRest;
    }

    if (unitInputValue > 0) {
      segments.push(unitInputValue.toFixed() + ' ' + unit[style] + ((style === 'long') && (unitInputValue > 1) ? 's' : ''));
    }
  }

  switch (style) {
    case 'long':
      return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(segments) + ' left';
    case 'short':
      return new Intl.ListFormat('en', { style: 'narrow', type: 'unit' }).format(segments) + ' left';
  }
}
