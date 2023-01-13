import * as React from 'react';

import * as util from '../util';


export function ExpandableText(props: { value: string; }) {
  let [width, setWidth] = React.useState<number | null>(null);
  let oldValue = util.usePrevious(props.value);
  let el = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let rect = el.current!.getBoundingClientRect();
    setWidth(rect.width);
  }, [props.value]);

  return (
    <div style={width && !(oldValue && (oldValue !== props.value)) ? { width: `${width}px`, textAlign: 'center' } : { fontWeight: '600' }} ref={el}>{props.value}</div>
  );
}
