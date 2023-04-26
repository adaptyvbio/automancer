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
  sublabel?: string | null;
}

export interface HierarchyCollectionEntry {
  type: 'collection';
  id: OrdinaryId;
  children: HierarchyEntry[];
  detail?: string | null;
  error?: string | null;
  label: string;
  sublabel?: string | null;
}

export type HierarchyEntry = HierarchyCollectionEntry | HierarchyNodeEntry;


export interface NodeHierarchyProps {
  entries: HierarchyEntry[];
}

export function NodeHierarchy(props: NodeHierarchyProps) {
  return (
    <div className={styles.root}>
      {props.entries.map((entry) => <NodeHierarchyEntry entry={entry} key={entry.id} />)}
    </div>
  )
}

export function NodeHierarchyEntry(props: { entry: HierarchyEntry; }) {
  switch (props.entry.type) {
    case 'collection':
      let [open, setOpen] = React.useState(true);

      return (
        <div className={formatClass(styles.collectionRoot, { '_open': open })}>
          <div className={styles.entryRoot}>
            <button type="button" className={styles.entryButton} onClick={() => void setOpen(!open)}>
              <Icon name="chevron_right" style="sharp" className={styles.entryIcon} />
              <div className={styles.entryBody}>
                <div className={styles.entryLabel}>{props.entry.label}</div>
                {props.entry.sublabel && <div className={styles.entrySublabel}>{props.entry.sublabel}</div>}
              </div>
              <div className={styles.entryValue}></div>
              {/* <Icon name="error" style="sharp" className={styles.entryErrorIcon} /> */}
            </button>
          </div>
          <div className={styles.collectionList}>
            {props.entry.children.map((childEntry) => <NodeHierarchyEntry entry={childEntry} key={childEntry.id} />)}
          </div>
        </div>
      );
    case 'node':
      return (
        <div className={styles.entryRoot}>
          <button type="button" className={styles.entryButton}>
            <Icon name={props.entry.icon} style="sharp" className={styles.entryIcon} />
            <div className={styles.entryBody}>
              <div className={styles.entryLabel}>{props.entry.label}</div>
              {props.entry.sublabel && <div className={styles.entrySublabel}>{props.entry.sublabel}</div>}
            </div>
            {props.entry.detail && <div className={styles.entryValue}>{props.entry.detail}</div>}
          </button>
          {props.entry.error && <Icon name="error" style="sharp" className={styles.entryErrorIcon} />}
        </div>
      );
  }
}
