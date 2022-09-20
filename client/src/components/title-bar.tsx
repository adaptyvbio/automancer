import * as React from 'react';

import { Icon } from '../components/icon';
import * as util from '../util';

import styles from '../../styles/components/title-bar.module.scss';


export interface TitleBarProps {
  subtitle?: string | null;
  subtitleVisible?: unknown;
  title: string;
}

export interface TitleBarState {
  notifying: boolean;
}

export class TitleBar extends React.Component<TitleBarProps, TitleBarState> {
  lastSubtitle: string | null = null;
  notificationHideTimeout: number | null = null;
  refTitle = React.createRef<HTMLDivElement>();

  constructor(props: TitleBarProps) {
    super(props);

    this.state = {
      notifying: false
    };
  }

  componentWillUnmount() {
    if (this.notificationHideTimeout !== null) {
      clearTimeout(this.notificationHideTimeout);
    }
  }

  notify() {
    if (this.notificationHideTimeout !== null) {
      clearTimeout(this.notificationHideTimeout);
    }

    this.setState({ notifying: true });

    this.notificationHideTimeout = setTimeout(() => {
      this.setState({ notifying: false });
    }, 2000);
  }

  render() {
    this.lastSubtitle = this.props.subtitle ?? this.lastSubtitle;

    return (
      <div className={styles.root}>
        <div className={styles.left} />
        <div className={util.formatClass(styles.titleRoot, {
          '_visible': (this.props.subtitleVisible || this.state.notifying)
        })} ref={this.refTitle}>
          <div className={styles.titleMain}>{this.props.title}</div>
          <div className={styles.titleSub}>{this.lastSubtitle}</div>
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
