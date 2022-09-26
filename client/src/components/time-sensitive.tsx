import * as React from 'react';


export function TimeSensitive(props: React.PropsWithChildren<{
  child(): React.ReactElement;
  interval?: number;
}>) {
  const [_, forceUpdate] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    let interval = setInterval(() => {
      forceUpdate();
    }, props.interval ?? 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return props.child();
}
