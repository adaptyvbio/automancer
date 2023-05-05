import * as React from 'react';

import styles from '../../styles/components/shadow-scrollable.module.scss';

import { formatClass } from '../util';


/**
 * A component which creates a shadow at the top and bottom of an element when these are not the start end of the scroll container.
 *
 * @param className A class added to the rendered wrapper element.
 * @param direction Whether the the child element should scroll horizontally or vertically.
 * @param mode Whether to create the shadow as a linear or radial gradient.
 */
export function ShadowScrollable(props: React.PropsWithChildren<{
  className?: string;
  direction: 'horizontal' | 'vertical';
  mode?: 'linear' | 'radial';
}>) {
  let ref = React.useRef<HTMLDivElement>(null);

  let update = () => {
    let elOuter = ref.current!;
    let elInner = elOuter.children[0];

    let [scrollStart, scrollEnd] = (props.direction === 'horizontal')
      ? [
        elInner.scrollLeft,
        (elInner.scrollWidth - elOuter.offsetWidth - elInner.scrollLeft)
      ]
      : [
        elInner.scrollTop,
        (elInner.scrollHeight - elOuter.offsetHeight - elInner.scrollTop)
      ]

    elOuter.style.setProperty('--scroll-start', CSS.number(scrollStart));
    elOuter.style.setProperty('--scroll-end', CSS.number(scrollEnd));
  };

  React.useEffect(() => {
    let controller = new AbortController();

    ref.current!.children[0].addEventListener('scroll', () => {
      update();
    }, { signal: controller.signal });

    update();

    return () => void controller.abort();
  }, []);

  return (
    <div
      className={formatClass(styles.root, props.className)}
      data-direction={props.direction}
      data-mode={props.mode ?? 'linear'}
      ref={ref}>
      {props.children}
    </div>
  );
}
