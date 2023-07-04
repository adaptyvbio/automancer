import { AnyDurationTerm } from 'pr1-shared';
import { formatSuperscript } from 'quantops';
import { ReactNode, createElement } from 'react';


export interface TimeUnit {
  factor: number;
  long: string;
  name: Intl.RelativeTimeFormatUnit | null;
  narrow: string;
  short: string;
}

export const TIME_UNITS: TimeUnit[] = [
  { factor: 3600e3 * 24 * 7,
    long: 'week',
    name: 'week',
    narrow: 'w',
    short: 'week' },
  { factor: 3600e3 * 24,
    long: 'day',
    name: 'day',
    narrow: 'd',
    short: 'day' },
  { factor: 3600e3,
    long: 'hour',
    name: 'hour',
    narrow: 'h',
    short: 'hr' },
  { factor: 60e3,
    long: 'minute',
    name: 'minute',
    narrow: 'm',
    short: 'min' },
  { factor: 1000,
    long: 'second',
    name: 'second',
    narrow: 's',
    short: 'sec' },
  { factor: 1,
    long: 'millisecond',
    name: null,
    narrow: 'ms',
    short: 'msec' }
];

export const TIME_UNITS_REVERSED = TIME_UNITS.slice().reverse();

export const CLOCK_TIME_UNITS = TIME_UNITS.slice(2, 5);


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


// ---


export function formatUnitQuantity(unitValue: number, unit: TimeUnit, style: 'long' | 'narrow' | 'short') {
  return unitValue.toFixed() + ((style !== 'narrow') ? ' ' : '') + unit[style] + ((style === 'long') && (unitValue > 1) ? 's' : '');
}


/**
 * Format a duration in natural language.
 *
 * To be replaced with [`Intl.DurationFormat`](https://github.com/tc39/proposal-intl-duration-format) once stable.
 *
 * @param input The duration, in milliseconds.
 * @param options.absoluteResolution The smallest absolute fraction of the input to display. Defaults to `0`, meaning all of the duration is displayed before taking `relativeResolution` into account.
 * @param options.relativeResolution The smallest relative fraction of the input to display. Defaults to `0.01`, meaning at least 99% of the duration is displayed before taking `relativeResolution` into account.
 * @param options.style The duration's style: `long` (`1 hour and 40 minutes`), `short` (`1 hr 40 min`), `narrow` (`1h 40m`) or `numeric` (`01:40`).
 */
export function formatDuration(input: number, options?: {
  absoluteResolution?: number;
  relativeResolution?: number;
  style?: 'long' | 'narrow' | 'short';
}) {
  let style = (options?.style ?? 'short');
  let rest = Math.round(input);

  let absoluteResolution = (options?.absoluteResolution ?? 0);
  let relativeResolution = rest * (options?.relativeResolution ?? 0.01);

  let segments: string[] = [];

  for (let unit of TIME_UNITS) {
    let unitValue = Math.floor(rest / unit.factor);
    let newRest = rest % unit.factor;

    if ((newRest < relativeResolution) || (newRest < absoluteResolution)) {
      unitValue = Math.round(rest / unit.factor);
      rest = 0;
    } else {
      rest = newRest;
    }

    if (unitValue > 0) {
      segments.push(formatUnitQuantity(unitValue, unit, style));
    }

    if (rest <= 0) {
      break;
    }
  }

  if (segments.length < 1) {
    segments.push(formatUnitQuantity(0, TIME_UNITS.at(-2)!, style));
  }

  switch (style) {
    case 'long':
      return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(segments);
    case 'narrow':
    case 'short':
      return new Intl.ListFormat('en', { style: 'narrow', type: 'unit' }).format(segments);
  }
}

/**
 * Format a remaining duration in natural language, returning values such as "3 minutes left".
 *
 * @param input The duration, in milliseconds.
 * @param options.style The style to use, one of `long` (`2 minutes left`), `short` (`2 min left`) or `narrow` (`2m left`). Defaults to `short`.
 * @returns The formatted duration, suitable for both text and React.
 */
export function formatRemainingDuration(input: number, options?: {
  style?: 'long' | 'narrow' | 'short';
}) {
  if (input < 60e3) {
    return 'Less than a minute left';
  }

  for (let unit of TIME_UNITS) {
    if (input > unit.factor) {
      let unitValue = Math.round(input / unit.factor);

      return formatUnitQuantity(unitValue, unit, options?.style ?? 'short') + ' left';
    }
  }

  throw new Error();
}


export function formatDigitialDisplayWithoutDays(hours: number, minutes: number, seconds: number) {
  return [hours, minutes]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

export function formatDigitalDisplayAsReact(days: number, hours: number, minutes: number, seconds: number): ReactNode {
  return [
    formatDigitialDisplayWithoutDays(hours, minutes, seconds),
    (days !== 0)
      ? createElement('sup', { key: 0 }, [
        (days > 0) ? '+' : '\u2212', // &minus;
        Math.abs(days).toFixed(0)
      ])
      : null
  ];
}

export function formatDigitalDisplayAsText(days: number, hours: number, minutes: number, seconds: number) {
  return formatDigitialDisplayWithoutDays(hours, minutes, seconds)
    + ((days !== 0)
      ? formatSuperscript(days, { sign: true })
      : '');
}


/**
 * Format a digital display, returning values such as "01:02:03⁺¹".
 *
 * @param days The number of days.
 * @param hours The number of hours.
 * @param minutes The number of minutes.
 * @param seconds The number of seconds.
 * @param options.format The format to use, either `react` (React nodes) or `text` (plain text).
 */
export function formatDigitalDisplay(days: number, hours: number, minutes: number, seconds: number, options: { format: 'react'; }): ReactNode;
export function formatDigitalDisplay(days: number, hours: number, minutes: number, seconds: number, options: { format: 'text'; }): string;
export function formatDigitalDisplay(days: number, hours: number, minutes: number, seconds: number, options: { format: 'react' | 'text'; }) {
  switch (options.format) {
    case 'react':
      return formatDigitalDisplayAsReact(days, hours, minutes, seconds);
    case 'text':
      return formatDigitalDisplayAsText(days, hours, minutes, seconds);
  }
}


/**
 * Format a date with a digital layout.
 *
 * @param input The date, in milliseconds.
 * @param ref The reference date used to calculate the day difference, in milliseconds.
 */
export function formatDigitalDate(input: number, ref: number, options: { format: 'text' }): string;
export function formatDigitalDate(input: number, ref: number, options: { format: 'react' }): ReactNode;
export function formatDigitalDate(input: number, ref: number, options: { format: any; }) {
  let date = new Date(input);

  let midnight = new Date(ref);
  midnight.setHours(0, 0, 0, 0);

  let days = (ref !== null)
    ? Math.floor((input - midnight.getTime()) / 24 / 3600e3)
    : 0;

    return formatDigitalDisplay(days, date.getHours(), date.getMinutes(), date.getSeconds(), { format: options.format });
}


/**
 * Format a time with a digital layout.
 *
 * @param input The time, in milliseconds.
 */
export function formatDigitalTime(input: number, options: { format: 'text' }): string;
export function formatDigitalTime(input: number, options: { format: 'react' }): ReactNode;
export function formatDigitalTime(input: number, options: { format: any; }) {
  let rest = input;

  let [hours, minutes, seconds] = CLOCK_TIME_UNITS.map((unit) => {
    let value = Math.floor(rest / unit.factor);
    rest %= unit.factor;

    return value;
  });

  let days = Math.floor(input / 24 / 3600e3);

  return formatDigitalDisplay(days, hours, minutes, seconds, { format: options.format });
}


/**
 * Format a pair of dates or times.
 *
 * @param a The first time, in milliseconds.
 * @param b The second time, in milliseconds. If `null`, it is omitted.
 * @param ref The reference time used to calculate the day difference, in milliseconds.
 * @param options.display The display to use, either `date` or `time`.
 * @param options.mode The mode to use, either `directional` (`10:00 → 11:00`) or `range` (`10:00 – 11:00`).
 */
export function formatDateOrTimePair(a: number, b: number | null, ref: number, options: {
  display: 'date' | 'time';
  format: 'react';
  mode?: 'directional' | 'range';
}): ReactNode;
export function formatDateOrTimePair(a: number, b: number | null, ref: number, options: {
  display: 'date' | 'time';
  format: 'text';
  mode?: 'directional' | 'range';
}): string;
export function formatDateOrTimePair(a: number, b: number | null, ref: number, options: {
  display: 'date' | 'time';
  format: any;
  mode?: 'directional' | 'range';
}): ReactNode {
  let symbol = {
    directional: '\u2192', // &rarr;
    range: '\u2013' // &ndash;
  }[options?.mode ?? 'range'];

  let format = (item: number) => {
    switch (options.display) {
      case 'date':
        return formatDigitalDate(item, ref, { format: options.format });
      case 'time':
        return formatDigitalTime(item - ref, { format: options.format });
    }
  };

  if (b !== null) {
    let diff = Math.abs(b - a);

    if (diff < 60e3) {
      return format(a);
    }
  }

  return [
    format(a),
    '\xa0',
    symbol,
    ...((b !== null)
      ? [' ', format(b)]
      : [])
  ];
}


/**
 * Format a pair of values.
 *
 * @param a The first value.
 * @param b The second value. If `null`, it is omitted.
 * @param options.mode The mode to use, either `directional` (`10 → 11`) or `range` (`10 – 11`).
 */
export function formatPair(a: ReactNode, b: ReactNode | null, options: {
  format: 'react';
  mode?: 'directional' | 'range';
}): ReactNode;
export function formatPair(a: string, b: string | null, options: {
  format: 'text';
  mode?: 'directional' | 'range';
}): string;
export function formatPair(a: ReactNode | string, b: ReactNode | string | null, options: {
  format: any;
  mode?: 'directional' | 'range';
}) {
  if (b === null) {
    return a;
  }

  let symbol = {
    directional: '\u2192', // &rarr;
    range: '\u2013' // &ndash;
  }[options?.mode ?? 'range'];

  switch (options.format) {
    case 'react':
      return [a, '\xa0', symbol, ' ', b];
    case 'text':
      return a + '\xa0' + symbol + ' ' + b;
    default:
      throw new Error();
  }
}


/**
 * Format a relative time difference.
 *
 * @param input The time difference, in milliseconds.
 * @param options.style The style to use, one of `long`, `short` or `narrow`. Defaults to `long`.
 */
export function formatTimeDifference(input: number, options?: {
  style: 'long' | 'narrow' | 'short';
}) {
  const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
    localeMatcher: 'best fit',
    numeric: 'auto',
    style: (options?.style ?? 'long')
  });

  for (let [unitIndex, unit] of TIME_UNITS_REVERSED.entries()) {
    let nextUnit = TIME_UNITS_REVERSED[unitIndex + 1];

    if (unit.name && (!nextUnit || (Math.abs(input) < nextUnit.factor))) {
      return relativeTimeFormatter.format(Math.round(input / unit.factor), unit.name);
    }
  }

  return relativeTimeFormatter.format(0, 'second');
}
