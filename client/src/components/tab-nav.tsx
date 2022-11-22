import * as React from 'react';

import { ExpandableText } from './expandable-text';
import * as util from '../util';

import styles from '../../styles/components/tab-nav.module.scss';


export interface TabNavProps {
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
      activeEntryId: this.props.entries.find((entry) => !entry.disabled)?.id ?? null
    };
  }

  render() {
    return (
      <div className={styles.root}>
        <nav className={styles.nav}>
          {this.props.entries.map((entry) => (
            <button
              type="button"
              disabled={!!entry.disabled}
              className={util.formatClass(styles.entry, { '_active': entry.id === this.state.activeEntryId })}
              onClick={() => {
                this.setState({ activeEntryId: entry.id });
              }}
              key={entry.id}>
              <ExpandableText>{entry.label}</ExpandableText>
            </button>
          ))}
        </nav>
        <div className={styles.contents}>
          {this.props.entries.find((entry) => entry.id === this.state.activeEntryId)?.contents?.()}
        </div>
      </div>
    );
  }
}
