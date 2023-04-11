import * as React from 'react';

import styles from '../../styles/components/device-hierarchy.module.scss';

import { OrdinaryId } from '../interfaces/util';
import { formatClass } from '../util';
import { Icon } from './icon';


export interface HierarchyNodeEntry {
  type: 'node';
  id: OrdinaryId;
  detail?: string | null;
  error?: string | null;
  icon: string;
  label: string;
}

export interface HierarchyCollectionEntry {
  type: 'collection';
  id: OrdinaryId;
  children: HierarchyEntry[];
  detail?: string | null;
  error?: string | null;
  label: string;
}

export type HierarchyEntry = HierarchyCollectionEntry | HierarchyNodeEntry;


export interface NodeHierarchyProps {
  entries: HierarchyEntry[];
}

export function NodeHierarchy(props: NodeHierarchyProps) {
  return (
    <div className={styles.alt1}>
      <div className={styles.alt2}>
        <div className={styles.root}>
          {props.entries.map((entry) => <NodeHierarchyEntry entry={entry} key={entry.id} />)}
          {/* <button type="button" className={styles.entryRoot}>
            <Icon name="thermostat" style="sharp" className={styles.icon} />
            <div className={styles.entryLabel}>OkolabController</div>
            <div className={styles.entryValue}>17.5ºC</div>
            <Icon name="push_pin" style="sharp" className={styles.entryErrorIcon} />
          </button>
          <div className={styles.collectionRoot}>
            <button type="button" className={styles.entryRoot}>
              <Icon name="chevron_right" style="sharp" className={styles.icon} />
              <div className={styles.entryLabel}>OkolabController</div>
              <div className={styles.entryValue}></div>
              <Icon name="error" style="sharp" className={styles.entryErrorIcon} />
            </button>
            <div className={styles.collectionList}>
              <div className={styles.entryRoot}>
                <Icon name="thermostat" style="sharp" className={styles.icon} />
                <div className={styles.entryLabel}>Temperature setpoint</div>
                <div className={styles.entryValue}>17.5ºC</div>
                <Icon name="error" style="sharp" className={styles.entryErrorIcon} />
              </div>
            </div>
          </div> */}
        </div>
      </div>
    </div>
  )
}

export function NodeHierarchyEntry(props: { entry: HierarchyEntry; }) {
  switch (props.entry.type) {
    case 'collection':
      let [open, setOpen] = React.useState(false);

      return (
        <div className={formatClass(styles.collectionRoot, { '_open': open })}>
          <button type="button" className={styles.entryRoot} onClick={() => void setOpen(!open)}>
            <Icon name="chevron_right" style="sharp" className={styles.entryIcon} />
            <div className={styles.entryLabel}>{props.entry.label}</div>
            <div className={styles.entryValue}></div>
            {/* <Icon name="error" style="sharp" className={styles.entryErrorIcon} /> */}
          </button>
          <div className={styles.collectionList}>
            {props.entry.children.map((childEntry) => <NodeHierarchyEntry entry={childEntry} key={childEntry.id} />)}
          </div>
        </div>
      );
    case 'node':
      return (
        <button type="button" className={styles.entryRoot}>
          <Icon name={props.entry.icon} style="sharp" className={styles.entryIcon} />
          <div className={styles.entryLabel}>{props.entry.label}</div>
          {props.entry.detail && <div className={styles.entryValue}>{props.entry.detail}</div>}
          {props.entry.error && <Icon name="error" style="sharp" className={styles.entryErrorIcon} />}
        </button>
      );
  }
}

// export function NodeHierarchyCollectionEntry(props: { entry: HierarchyCollectionEntry; }) {

// }
