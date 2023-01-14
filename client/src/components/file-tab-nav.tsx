import * as React from 'react';

import styles from '../../styles/components/file-tab-nav.module.scss';

import * as util from '../util';
import { MenuDef, MenuEntryPath } from './context-menu';
import { ContextMenuArea } from './context-menu-area';
import { Icon } from './icon';
import { ShadowScrollable } from './shadow-scrollable';


export function FileTabNav(props: {
  entries: FileTabNavEntryDef[];
}) {
  return (
    <ShadowScrollable>
      <div className={styles.root}>
        <div className={styles.list}>
          {props.entries.map((entry) => (
            <FileTabNavEntry entry={entry} key={entry.id} />
          ))}
        </div>
      </div>
    </ShadowScrollable>
  )
}


export interface FileTabNavEntryDef {
  closable?: unknown;
  createMenu?(): MenuDef;
  detail?: string | null;
  id: string;
  label: string;
  onClose?(): void;
  onSelect?(): void;
  onSelectMenu?(path: MenuEntryPath): void;
  selected?: unknown;
  unsaved?: unknown;
}

export function FileTabNavEntry(props: { entry: FileTabNavEntryDef}) {
  let entry = props.entry;

  return (
    <div className={util.formatClass(styles.entryRoot, {
      '_selected': entry.selected,
      '_unsaved': entry.unsaved
    })}>
      <ContextMenuArea
        createMenu={entry.createMenu}
        onSelect={entry.onSelectMenu}>
        <button type="button" className={styles.entryBody} onClick={entry.onSelect}>
          <div className={styles.entryLabel}>{entry.label}</div>
          {entry.detail && <div className={styles.entryDetail}>{entry.detail}</div>}
        </button>
      </ContextMenuArea>
      <button type="button" className={styles.entryButton} onClick={entry.onClose}>
        <Icon name="close" style="sharp" className={util.formatClass(styles.entryIcon, styles.entryIconClose)} />
        <Icon name="fiber_manual_record" style="sharp" className={util.formatClass(styles.entryIcon, styles.entryIconUnsaved)} />
      </button>
    </div>
  );
}
