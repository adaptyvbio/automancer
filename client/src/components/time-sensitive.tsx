import * as React from 'react';

import * as util from '../util';


export function TimeSensitive(props: React.PropsWithChildren<{
  child(): React.ReactElement;
  interval?: number;
}>) {
  let forceUpdate = util.useForceUpdate();

  React.useEffect(() => {
    let interval = setInterval(() => {
      forceUpdate();
    }, props.interval ?? 1000);

    return () => {
      clearInterval(interval);
    };
  }, [props.interval]);

  return props.child();
}
