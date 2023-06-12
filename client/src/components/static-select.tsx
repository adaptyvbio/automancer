import { OrdinaryId } from 'pr1-shared';
import { PropsWithChildren, ReactNode } from 'react';

import styles from '../../styles/components/static-select.module.scss';

import { formatClass } from '../util';


/**
 * @deprecated
 */
export function OldStaticSelect<T extends {
  id?: OrdinaryId;
  label: ReactNode;
}>(props: PropsWithChildren<{
  disabled?: unknown;
  options: T[];
  rootClassName?: string;
  selectedOption: T;
  selectionClassName?: string;
  selectOption?(option: T, optionIndex: number): void;
}>) {
  return (
    <div className={formatClass(styles.root, props.rootClassName)}>
      <div className={props.selectionClassName}>{props.children}</div>
      <select
        disabled={!!props.disabled}
        value={props.options.indexOf(props.selectedOption)}
        onInput={(event) => {
          let optionIndex = parseInt(event.currentTarget.value);
          props.selectOption?.(props.options[optionIndex], optionIndex);
        }}>
        {props.options.map((option, optionIndex) => (
          <option value={optionIndex} key={option.id ?? optionIndex}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

export function StaticSelect<T extends OrdinaryId | null>(props: PropsWithChildren<{
  disabled?: unknown;
  options: {
    id: T;
    label: string;
  }[];
  rootClassName?: string;
  selectedOptionId: T;
  selectionClassName?: string;
  selectOption?(optionId: T): void;
}>) {
  let selectedOption = props.options.find((option) => (option.id === props.selectedOptionId))!;

  return (
    <div className={formatClass(styles.root, props.rootClassName)}>
      <div className={props.selectionClassName}>{props.children ?? selectedOption.label}</div>
      <select
        disabled={!!props.disabled}
        value={props.options.findIndex((option) => (option.id === props.selectedOptionId))}
        onInput={(event) => {
          let optionIndex = parseInt(event.currentTarget.value);
          props.selectOption?.(props.options[optionIndex].id);
        }}>
        {props.options.map((option, optionIndex) => (
          <option value={optionIndex} key={optionIndex}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
