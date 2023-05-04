import { OrdinaryId } from '../interfaces/util';
import * as React from 'react';

import styles from '../../styles/components/static-select.module.scss';


export function StaticSelect<T extends {
  id?: OrdinaryId;
  label: string;
}>(props: React.PropsWithChildren<{
  options: T[];
  selectOption?(option: T): void;
  selectedOption: T;
}>) {
  return (
    <div className={styles.root}>
      <div>{props.children}</div>
      <select value={props.options.indexOf(props.selectedOption)} onInput={(event) => {
        let optionIndex = parseInt(event.currentTarget.value);
        props.selectOption?.(props.options[optionIndex]);
      }}>
        {props.options.map((option, optionIndex) => (
          <option value={optionIndex} key={option.id ?? optionIndex}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
