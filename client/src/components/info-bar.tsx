import { PropsWithChildren, ReactNode } from 'react';

import { formatClass } from '../util';

import styles from '../../styles/components/info-bar.module.scss';


export function InfoBar(props: PropsWithChildren<{
  className?: string;
  left?: ReactNode;
  right?: ReactNode;
  mode?: 'default' | 'edit';
}>) {
  return (
    <div className={formatClass(styles.container, props.className)}>
      {props.children}
      <div className={styles.root} data-mode={props.mode ?? 'default'}>
        <div>{props.left}</div>
        <div>{props.right}</div>
      </div>
    </div>
  );
}
