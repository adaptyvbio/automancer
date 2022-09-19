import * as React from 'react';

import { Icon } from '../components/icon';

import styles from '../../styles/components/title-bar.module.scss';


export interface TitleBarProps {
  subtitle?: string | null;
  subtitleVisible?: unknown;
  title: string;
}

export class TitleBar extends React.Component<TitleBarProps> {
  constructor(props: TitleBarProps) {
    super(props);
  }

  render() {
    return (
      <div className={styles.root}>
        <div className={styles.left} />
        <div className={styles.titleRoot}>
          <div className={styles.titleMain}>{this.props.title}</div>
          {this.props.subtitle && (
            <div className={styles.titleSub}>{this.props.subtitle}</div>
          )}
        </div>
        <div className={styles.right}>
          <div className={styles.toolsRoot}>
            <button type="button" className={styles.toolsItem}>
              <Icon name="view_list" />
            </button>
            <button type="button" className={styles.toolsItem}>
              <Icon name="code" />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
