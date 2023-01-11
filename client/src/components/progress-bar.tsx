import * as React from 'react';

import * as util from '../util';
import { UnstableText } from './unstable-text';

import styles from '../../styles/components/progress-bar.module.scss';


export type ProgressBarProps = {
  paused?: unknown;
  progressRef?: React.RefObject<HTMLDivElement>;
  setValue?(newValue: number): void;
} & (
  { value: number; } |
  { getValue(): number;
    textUpdateInterval?: number; }
);

export interface ProgressBarState {
  selectValue: number | null;
}

export class ProgressBar extends React.Component<ProgressBarProps, ProgressBarState> {
  constructor(props: ProgressBarProps) {
    super(props);

    this.state = {
      selectValue: null
    };
  }

  private getValue() {
    return 'value' in this.props
      ? this.props.value
      : this.props.getValue();
  }

  render() {
    let currentValue = this.getValue();

    return (
      <div className={util.formatClass(styles.root, {
        '_paused': this.props.paused,
        '_writable': this.props.setValue
      })}>
        <div className={styles.outer}
          onMouseMove={this.props.setValue && ((event) => {
            let inner = event.currentTarget.firstChild as HTMLDivElement;
            let innerRect = inner.getBoundingClientRect();

            let value = (event.clientX - innerRect.x) / innerRect.width;
            value = Math.min(1, Math.max(0, value));

            this.setState({ selectValue: value });
          })}
          onMouseLeave={this.props.setValue && (() => {
            this.setState({ selectValue: null });
          })}
          onClick={this.props.setValue && (() => {
            this.props.setValue!(this.state.selectValue!);
          })}>
          <div className={styles.inner} />
          <div className={styles.progress} style={{ width: `${currentValue * 100}%` }} ref={this.props.progressRef} />
          {(this.state.selectValue !== null) && (
            <div className={styles.select} style={{ width: `${this.state.selectValue * 100}%` }} />
          )}
        </div>
        <div className={styles.text}>
          <UnstableText
            interval={
              (('textUpdateInterval' in this.props) && (this.props.textUpdateInterval !== undefined)) && !this.props.paused
                ? this.props.textUpdateInterval
                : null
            }
            contents={() => {
              let currentValue = this.getValue();

              return (
                <>{((this.state.selectValue ?? currentValue) * 100).toFixed(0)}%</>
              );
            }} />
        </div>
      </div>
    )
  }
}
