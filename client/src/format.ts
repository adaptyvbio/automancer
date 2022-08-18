export function formatDuration(input: number): string {
  if (input < 1000) {
    return `${input} ms`;
  } else if (input < 60e3) {
    return `${input / 1000} sec`;
  } else if (input < 3600e3) {
    let min = Math.floor(input / 60e3);
    let sec = Math.round(Math.floor(input % 60e3) / 1000);
    return `${min} min` + (sec > 0 ? ` ${sec} sec` : '');
  } else {
    let hour = Math.floor(input / 3600e3);
    let min = Math.floor((input % 3600e3) / 60e3);
    let sec = Math.round(Math.floor(input % 60e3) / 1000);
    return `${hour} hr${hour > 1 ? 's' : ''}` + (min > 0 ? ` ${min} min` : '') + (sec > 0 ? ` ${sec} sec` : '');
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
