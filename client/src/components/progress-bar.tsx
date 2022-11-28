import * as React from 'react';

import * as util from '../util';
import { UnstableText } from './unstable-text';

import styles from '../../styles/components/progress-bar.module.scss';


export interface ProgressBarProps {
  paused?: unknown;
  setValue?(newValue: number): void;
  targetEndTime?: number;
  time: number;
  value: number;
}

export interface ProgressBarState {
  selectValue: number | null;
}

export class ProgressBar extends React.Component<ProgressBarProps, ProgressBarState> {
  animation: Animation | null = null;
  ref = React.createRef<HTMLDivElement>();

  constructor(props: ProgressBarProps) {
    super(props);

    this.state = {
      selectValue: null
    };
  }

  componentDidMount() {
    this.update();
  }

  componentDidUpdate(prevProps: ProgressBarProps, _prevState: ProgressBarState) {
    if (this.props !== prevProps) {
      this.update();
    }
  }

  update() {
    if (this.animation) {
      this.animation.cancel();
    }

    if (!this.props.paused && this.props.targetEndTime) {
      let duration = this.props.targetEndTime - Date.now();

      if (duration > 0) {
        this.animation = this.ref.current!.animate([
          { width: `${this.props.value * 100}%` },
          { width: '100%' }
        ], { duration, fill: 'forwards' });
      }
    }
  }

  render() {
    let time = Date.now();
    let remainingTime = this.props.targetEndTime ? this.props.targetEndTime - time : null;
    let currentValue = this.props.targetEndTime
      ? this.props.value + (time - this.props.time) / (this.props.targetEndTime! - this.props.time)
      : null;

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
          <div className={styles.progress} style={{ width: `${this.props.value * 100}%` }} ref={this.ref} />
          {this.state.selectValue !== null && (
            <div className={styles.select} style={{ width: `${this.state.selectValue * 100}%` }} />
          )}
        </div>
        <div className={styles.text}>
          <UnstableText
            interval={
              (!this.props.paused && this.props.targetEndTime)
                ? remainingTime! / (1 - currentValue!) / 100
                : null
            }
            contents={() => (
              <>
                {((this.state.selectValue ?? this.props.value + (Date.now() - this.props.time) / (this.props.targetEndTime! - this.props.time)) * 100).toFixed(0)}%
              </>
            )} />
        </div>
      </div>
    )
  }
}
