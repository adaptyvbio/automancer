import * as React from 'react';


export function OverflowableText(props: React.PropsWithChildren<{}>) {
  let refTarget = React.useRef<HTMLElement>();
  let child = props.children as any;

  React.useEffect(() => {
    let el = refTarget.current!;
    el.classList.toggle('_ellipsis', el.offsetWidth < el.scrollWidth);
  }, [child]);

  return React.cloneElement(child, {
    ref: (ref: HTMLElement) => {
      refTarget.current = ref;

      if (typeof child.ref === 'function') {
        child.ref(ref);
      }
    }
  });
}
