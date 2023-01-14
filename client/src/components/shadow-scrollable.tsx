import * as React from 'react';

import styles from '../../styles/components/shadow-scrollable.module.scss';


export function ShadowScrollable(props: React.PropsWithChildren<{}>) {
  let ref = React.useRef<HTMLDivElement>(null);

  let update = () => {
    let elOuter = ref.current!;
    let elInner = elOuter.children[0];

    elOuter.style.setProperty('--scroll-start', CSS.number(elInner.scrollLeft));
    elOuter.style.setProperty('--scroll-end', CSS.number(elInner.scrollWidth - elOuter.offsetWidth - elInner.scrollLeft));
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
    <div className={styles.root} ref={ref}>
      {props.children}
    </div>
  );
}
