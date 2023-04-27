import { Set as ImSet, List, fromJS } from 'immutable';
import * as React from 'react';

import styles from '../../styles/components/device-hierarchy.module.scss';

import { OrdinaryId } from '../interfaces/util';
import { formatClass } from '../util';
import { Icon } from './icon';
import { SyncObjectStore, useSyncObjectStore } from '../store';
import * as util from '../util';


export interface HierarchyNodeEntry<EntryId extends OrdinaryId> {
  type: 'node';
  id: EntryId;
  description?: string | null;
  detail?: string | null;
  error?: unknown;
  icon: string;
  label: string;
  selected?: unknown;
}

export interface HierarchyCollectionEntry<EntryId extends OrdinaryId> {
  type: 'collection';
  id: EntryId;
  children: HierarchyEntry<EntryId>[];
  description?: string | null;
  detail?: string | null;
  error?: string | null;
  label: string;
}

export type HierarchyEntry<EntryId extends OrdinaryId> = HierarchyCollectionEntry<EntryId> | HierarchyNodeEntry<EntryId>;
export type HierarchyEntryPath<EntryId extends OrdinaryId> = List<EntryId>;


export interface NodeHierarchyProps<HierarchyEntryId extends OrdinaryId> {
  entries: HierarchyEntry<HierarchyEntryId>[];
  store?: SyncObjectStore<unknown>;

  onSelectEntry(entryPath: HierarchyEntryPath<HierarchyEntryId>): void;
}

export function NodeHierarchy<HierarchyEntryId extends OrdinaryId>(props: NodeHierarchyProps<HierarchyEntryId>) {
  let [openEntryPaths, setOpenEntryPaths] = useSyncObjectStore(ImSet<List<HierarchyEntryId>>(), props.store, {
    deserialize(serializedValue: any) {
      return ImSet(fromJS(serializedValue));
    },
    serialize(value) {
      return value.toJS();
    }
  });

  return (
    <div className={styles.root}>
      {props.entries.map((entry) => (
        <NodeHierarchyEntry
          entry={entry}
          entryPath={List([entry.id])}
          onSelectEntry={props.onSelectEntry}
          openEntryPaths={openEntryPaths}
          setOpenEntryPaths={setOpenEntryPaths}
          key={entry.id} />
      ))}
    </div>
  )
}

export function NodeHierarchyEntry<HierarchyEntryId extends OrdinaryId>(props: {
  entry: HierarchyEntry<HierarchyEntryId>;
  entryPath: HierarchyEntryPath<HierarchyEntryId>;
  onSelectEntry(entryPath: HierarchyEntryPath<HierarchyEntryId>): void;
  openEntryPaths: ImSet<HierarchyEntryPath<HierarchyEntryId>>;
  setOpenEntryPaths(value: ImSet<HierarchyEntryPath<HierarchyEntryId>>): void;
}) {
  switch (props.entry.type) {
    case 'collection':
      return (
        <div className={formatClass(styles.collectionRoot, { '_open': props.openEntryPaths.has(props.entryPath) })}>
          <div className={styles.entryRoot}>
            <button type="button" className={styles.entryButton} onClick={() =>
              void props.setOpenEntryPaths(util.toggleSet(props.openEntryPaths, props.entryPath)
            )}>
              <Icon name="chevron_right" style="sharp" className={styles.entryIcon} />
              <div className={styles.entryBody}>
                <div className={styles.entryLabel}>{props.entry.label}</div>
                {props.entry.description && <div className={styles.entrySublabel}>{props.entry.description}</div>}
              </div>
              <div className={styles.entryValue}></div>
              {/* <Icon name="error" style="sharp" className={styles.entryErrorIcon} /> */}
            </button>
          </div>
          <div className={styles.collectionList}>
            {props.entry.children.map((childEntry) => (
              <NodeHierarchyEntry
                entry={childEntry}
                entryPath={props.entryPath.push(childEntry.id)}
                onSelectEntry={props.onSelectEntry}
                openEntryPaths={props.openEntryPaths}
                setOpenEntryPaths={props.setOpenEntryPaths}
                key={childEntry.id} />)
            )}
          </div>
        </div>
      );
    case 'node':
      return (
        <div className={styles.entryRoot}>
          <button
            type="button"
            className={formatClass(styles.entryButton, { '_selected': props.entry.selected })}
            onClick={() => void props.onSelectEntry(props.entryPath)}>
            <Icon name={props.entry.icon} style="sharp" className={styles.entryIcon} />
            <div className={styles.entryBody}>
              <div className={styles.entryLabel}>{props.entry.label}</div>
              {props.entry.description && <div className={styles.entrySublabel}>{props.entry.description}</div>}
            </div>
            {props.entry.detail && <div className={styles.entryValue}>{props.entry.detail}</div>}
          </button>
          {!!props.entry.error && <Icon name="error" style="sharp" className={styles.entryErrorIcon} />}
        </div>
      );
  }
}
