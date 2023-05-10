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
 * @param options.style The duration's style: `long` (`1 hour and 40 minutes`), `short` (`1 hr 40 min`), `narrow` (`1h 40m`) or `numeric` (`01:40`).
 */
export function formatDuration(input: number, options?: {
  range?: number;
  style?: ('long' | 'narrow' | 'numeric' | 'short');
}) {
  let range = (options?.range ?? input);
  let style = (options?.style ?? 'short');

  let inputRest = Math.round(input);
  let rangeRest = Math.round(range);

  let units = (style !== 'numeric')
    ? TIME_UNITS.slice()
    : TIME_UNITS.slice(1, 4);

  let segments: string[] = [];

  for (let unit of units.reverse()) {
    let unitInputValue = Math.floor(inputRest / unit.factor);
    let unitRangeValue = Math.floor(rangeRest / unit.factor);

    inputRest %= unit.factor;
    rangeRest %= unit.factor;

    if ((unitRangeValue > 0) || ((style === 'numeric') && TIME_UNITS.slice(1, 3).includes(unit))) {
      if (style !== 'numeric') {
        segments.push(unitInputValue.toFixed() + ((style !== 'narrow') ? ' ' : '') + unit[style] + (((style === 'long') && (unitInputValue > 1)) ? 's' : ''));
      } else {
        segments.push(unitInputValue.toFixed().padStart(2, '0'));
      }
    }
  }

  switch (style) {
    case 'numeric':
      return segments.join(':');
    case 'long':
      return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(segments);
    default:
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

export function formatAbsoluteTime(input: number): string {
  let time = new Date(input);
  return `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
}
