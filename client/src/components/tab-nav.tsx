import { Component, ReactNode } from 'react';

import styles from '../../styles/components/tab-nav.module.scss';

import { ExpandableText } from './expandable-text';
import * as util from '../util';

import { ShortcutGuide } from './shortcut-guide';
import { OrdinaryId } from 'pr1-shared';


export interface TabNavProps<T extends OrdinaryId> {
  activeEntryId?: T | null;
  setActiveEntryId?(id: T | null): void;

  entries: {
    id: T;
    contents?(): ReactNode;
    disabled?: unknown;
    label: string;
    shortcut?: string;
  }[];
}

export interface TabNavState<T extends OrdinaryId> {
  activeEntryId: T | null;
}

export class TabNav<T extends OrdinaryId> extends Component<TabNavProps<T>, TabNavState<T>> {
  constructor(props: TabNavProps<T>) {
    super(props);

    this.state = {
      activeEntryId: (this.props.activeEntryId === undefined)
        ? this.props.entries.find((entry) => !entry.disabled)?.id ?? null
        : null
    };
  }

  private setActiveEntryId(entryId: T) {
    if (this.props.activeEntryId !== undefined) {
      this.props.setActiveEntryId?.(entryId);
    } else {
      this.setState({ activeEntryId: entryId });
    }
  }

  override render() {
    let activeEntryId = (this.props.activeEntryId !== undefined)
      ? this.props.activeEntryId
      : this.state.activeEntryId;

    return (
      <div className={styles.root}>
        <nav className={styles.nav}>
          {this.props.entries.map((entry) => (
            <button
              type="button"
              disabled={!!entry.disabled}
              className={util.formatClass(styles.entry, { '_active': (entry.id === activeEntryId) })}
              onClick={() => void this.setActiveEntryId(entry.id)}
              key={entry.id}>
              <ExpandableText>
                <ShortcutGuide
                  onTrigger={() => void this.setActiveEntryId(entry.id)}
                  shortcut={entry.shortcut ?? null}>
                  {entry.label}
                </ShortcutGuide>
              </ExpandableText>
            </button>
          ))}
        </nav>
        <div className={styles.contents}>
          {this.props.entries.find((entry) => entry.id === activeEntryId)?.contents?.()}
        </div>
      </div>
    );
  }
}
