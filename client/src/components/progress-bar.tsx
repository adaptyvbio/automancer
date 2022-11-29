import * as React from 'react';

import * as util from '../util';
import { UnstableText } from './unstable-text';

import styles from '../../styles/components/progress-bar.module.scss';


export interface ProgressBarProps {
  duration: number;
  paused?: unknown;
  setValue?(newValue: number): void;
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

  getStats() {
    let deltaTime = Date.now() - this.props.time;
    let currentValue = Math.min(1, this.props.value + (!this.props.paused ? (deltaTime / this.props.duration) : 0));
    let remainingTime = this.props.duration * (1 - this.props.value) - deltaTime;

    return { currentValue, remainingTime };
  }

  update() {
    if (this.animation) {
      this.animation.cancel();
    }

    if (!this.props.paused) {
      let { currentValue, remainingTime } = this.getStats();

      if (remainingTime > 0) {
        this.animation = this.ref.current!.animate([
          { width: `${currentValue * 100}%` },
          { width: '100%' }
        ], { duration: remainingTime, fill: 'forwards' });
      }
    }
  }

  render() {
    let { currentValue, remainingTime } = this.getStats();

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
              !this.props.paused
                ? remainingTime / (1 - currentValue) / 100
                : null
            }
            contents={() => {
              let { currentValue } = this.getStats();

              return (
                <> {((this.state.selectValue ?? currentValue) * 100).toFixed(0)}%</>
              );
            }} />
        </div>
      </div>
    )
  }
}
