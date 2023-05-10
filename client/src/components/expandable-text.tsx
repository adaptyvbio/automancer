import * as React from 'react';
import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from 'react';

import { usePrevious } from '../util';


export function ExpandableText(props: PropsWithChildren<{
  expandedValue?: ReactNode;
}>) {
  let expandedValue = (props.expandedValue ?? props.children);
  let prevExpandedValue = usePrevious(expandedValue);

  let [width, setWidth] = useState<number | null>(null);
  let ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let rect = ref.current!.getBoundingClientRect();
    setWidth(rect.width);
  }, [expandedValue]);

  return (!prevExpandedValue || (expandedValue !== prevExpandedValue))
    ? (
      <span className="_expanded" style={{ display: 'inline-block' }} ref={ref}>{expandedValue}</span>
    )
    : (
      <span style={{ display: 'inline-block', width: `${width}px` }}>{props.children}</span>
    );
}
