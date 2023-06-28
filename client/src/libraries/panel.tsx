import { Fragment, PropsWithChildren, ReactNode } from 'react';


import styles from '../../styles/libraries/panel.module.scss';
import { Props } from '@floating-ui/react-dom-interactions/src/FloatingFocusManager';
import { Button } from '../components/button';
import { OrdinaryId } from 'pr1-shared';


export function PanelRoot(props: PropsWithChildren<{}>) {
  return (
    <div className={styles.root}>
      {props.children}
    </div>
  )
}

export function PanelLoader(props: {}) {
  return (
    <div className={styles.loader}>
      <PanelSpinner />
    </div>
  );
}

export function PanelPlaceholder(props: {
  message: ReactNode;
}) {
  return (
    <div className={styles.placeholder}>
      <p>{props.message}</p>
    </div>
  );
}


export function PanelActions(props: PropsWithChildren<{}>) {
  return (
    <div className={styles.actions}>
      {props.children}
    </div>
  );
}

export function PanelAction(props: PropsWithChildren<{}>) {
  return (
    // <button type="button">{props.children}</button>
    <Button className={styles.action} onClick={() => {

    }}>{props.children}</Button>
  );
}

export interface PanelDataEntry {
  id: OrdinaryId;
  label: ReactNode;
  value: ReactNode;
}

export function PanelDataList(props: {
  data: PanelDataEntry[] | Omit<PanelDataEntry, 'id'>[];
}) {
  return (
    <dl className={styles.datalist}>
      {props.data.map((item, index) => (
        <Fragment key={('id' in item) ? item.id : index}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function PanelSection(props: PropsWithChildren<{}>) {
  return (
    <section className={styles.section}>
      {props.children}
    </section>
  );
}

export function PanelSpinner(props: {}) {
  return (
    <svg viewBox="0 0 24 24" role="status" aria-label="Loading" className={styles.spinner}>
      <g transform="translate(1 1)" fillRule="nonzero" fill="none">
        <circle cx="11" cy="11" r="11"></circle>
        <path d="M10.998 22a.846.846 0 0 1 0-1.692 9.308 9.308 0 0 0 0-18.616 9.286 9.286 0 0 0-7.205 3.416.846.846 0 1 1-1.31-1.072A10.978 10.978 0 0 1 10.998 0c6.075 0 11 4.925 11 11s-4.925 11-11 11z" fill="currentColor" />
      </g>
    </svg>
  );
}
