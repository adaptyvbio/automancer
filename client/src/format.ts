const TIME_UNITS = [
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
 * @param options.style The duration's style: `long` (`1 hour and 40 minutes`), `short` (`1 hr 40 min`) or `narrow` (`1h 40m`).
 */
export function formatDuration(input: number, options?: { style: ('long' | 'narrow' | 'short'); }) {
  let style = options?.style ?? 'short';

  let segments: string[] = [];
  let rest = Math.round(input);

  for (let unit of Array.from(TIME_UNITS).reverse()) {
    let unitValue = Math.floor(rest / unit.factor);
    rest = rest % unit.factor;

    if (unitValue > 0) {
      segments.push(unitValue.toFixed(0) + ((style !== 'narrow') ? ' ' : '') + unit[style] + (((style === 'long') && (unitValue > 1)) ? 's' : ''));
    }
  }

  return new Intl.ListFormat('en', (style !== 'long')
    ? { style: 'narrow', type: 'unit' }
    : { style: 'long', type: 'conjunction' }).format(segments);
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
