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
    return `${hour} hr` + (min > 0 ? ` ${min} min` : '') + (sec > 0 ? ` ${sec} sec` : '');
  }
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
