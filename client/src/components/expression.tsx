import * as React from 'react';

import styles from '../../styles/components/expression.module.scss';


export function Expression(props: { contents: string; }) {
  return (
    <div className={styles.root}>{props.contents}</div>
  );
}
