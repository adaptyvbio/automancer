import * as React from 'react';

import { ExpandableText } from './expandable-text';
import * as util from '../util';

import styles from '../../styles/components/tab-nav.module.scss';


export interface TabNavProps {
  activeEntryId?: string | null;
  setActiveEntryId?(id: string | null): void;

  entries: {
    id: string;
    contents?: () => React.ReactNode;
    disabled?: unknown;
    label: string;
  }[];
}

export interface TabNavState {
  activeEntryId: string | null;
}

export class TabNav extends React.Component<TabNavProps, TabNavState> {
  constructor(props: TabNavProps) {
    super(props);

    this.state = {
      activeEntryId: (this.props.activeEntryId === undefined)
      ? this.props.entries.find((entry) => !entry.disabled)?.id ?? null
      : null
    };
  }

  render() {
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
              className={util.formatClass(styles.entry, { '_active': entry.id === activeEntryId })}
              onClick={() => {
                if (this.props.activeEntryId !== undefined) {
                  this.props.setActiveEntryId?.(entry.id);
                } else {
                  this.setState({ activeEntryId: entry.id });
                }
              }}
              key={entry.id}>
              <ExpandableText value={entry.label} />
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
