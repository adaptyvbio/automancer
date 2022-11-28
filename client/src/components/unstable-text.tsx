import * as React from 'react';

import * as util from '../util';


export function UnstableText(props: {
  contents(): React.ReactNode;
  interval: number | null;
}) {
  let forceUpdate = util.useForceUpdate();
  // let refInterval = React.useRef<number | null>(null);
  console.log(props.interval);

  React.useEffect(() => {
    if (props.interval !== null) {
      let interval = setInterval(() => void forceUpdate(), Math.max(props.interval, 30));

      return () => {
        clearInterval(interval);
      };
    }
  }, [props.interval]);

  return (
    <>{props.contents()}</>
  );
}
