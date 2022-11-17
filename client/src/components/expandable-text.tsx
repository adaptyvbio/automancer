import * as React from 'react';


export function ExpandableText(props: React.PropsWithChildren<{}>) {
  let [width, setWidth] = React.useState<number | null>(null);
  let el = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let rect = el.current!.getBoundingClientRect();
    setWidth(rect.width);
  }, []);

  return (
    <div style={width ? { width: `${width}px`, textAlign: 'center' } : { fontWeight: '600' }} ref={el}>{props.children}</div>
  );
}
