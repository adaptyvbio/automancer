import { Component, ReactNode, createRef } from 'react';

import styles from '../../styles/components/title-bar.module.scss';

import { Icon } from '../components/icon';
import * as util from '../util';


export interface TitleBarProps {
  subtitle?: ReactNode | null;
  subtitleVisible?: unknown;
  title: ReactNode;

  tools?: {
    id: string;
    active?: unknown;
    icon: string;
    label?: string;
    onClick?(): void;
  }[];
}

export interface TitleBarState {
  notifying: boolean;
}

export class TitleBar extends Component<TitleBarProps, TitleBarState> {
  private lastSubtitle: ReactNode | null = null;
  private notificationHideTimeout: number | null = null;
  private refTitle = createRef<HTMLDivElement>();

  constructor(props: TitleBarProps) {
    super(props);

    this.state = {
      notifying: false
    };
  }

  override componentWillUnmount() {
    if (this.notificationHideTimeout !== null) {
      clearTimeout(this.notificationHideTimeout);
    }
  }

  notify() {
    if (this.props.subtitle) {
      if (this.notificationHideTimeout !== null) {
        clearTimeout(this.notificationHideTimeout);
      }

      this.setState({ notifying: true });

      this.notificationHideTimeout = setTimeout(() => {
        this.setState({ notifying: false });
      }, 2000);
    }
  }

  override render() {
    this.lastSubtitle = this.props.subtitle ?? this.lastSubtitle;

    return (
      <div className={styles.root}>
        <div className={styles.left} />
        <div className={util.formatClass(styles.titleRoot, {
          '_subtitle': this.props.subtitle,
          '_visible': (this.props.subtitleVisible || this.state.notifying)
        })} ref={this.refTitle}>
          <div className={styles.titleMain}>{this.props.title}</div>
          <div className={styles.titleSub}>{this.lastSubtitle}</div>
        </div>
        <div className={styles.right}>
          {((this.props.tools?.length ?? 0) > 0) && (
            <div className={styles.toolsRoot}>
              {this.props.tools!.map((tool) => (
                <button
                  type="button"
                  className={util.formatClass(styles.toolsItem, { '_active': tool.active })}
                  title={tool.label}
                  onClick={tool.onClick}
                  key={tool.id}>
                  <Icon name={tool.icon} style="sharp" className={styles.toolsIcon} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
}
