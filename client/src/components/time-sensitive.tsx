import { ReactNode, useEffect } from 'react';

import { useForceUpdate } from '../util';


export function TimeSensitive(props: {
  contents(): ReactNode;
  interval: number | null;
}) {
  let forceUpdate = useForceUpdate();

  useEffect(() => {
    if (props.interval !== null) {
      let interval = setInterval(() => void forceUpdate(), Math.max(props.interval, 30));

      return () => void clearInterval(interval);
    }

    return () => {};
  }, [props.interval]);

  return (
    <>{props.contents()}</>
  );
}
