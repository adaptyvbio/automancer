import * as React from 'react';

import { ProgressBar } from './progress-bar';


export interface TimedProgressBarProps {
  date: number;
  duration: number;
  paused?: unknown;
  setValue?(newValue: number): void;
  value: number;
}

export interface TimedProgressBarState {

}

export class TimedProgressBar extends React.Component<TimedProgressBarProps, TimedProgressBarState> {
  private animation: Animation | null = null;
  private ref = React.createRef<HTMLDivElement>();

  constructor(props: TimedProgressBarProps) {
    super(props);
  }

  componentDidMount() {
    this.update();
  }

  componentDidUpdate(prevProps: Readonly<TimedProgressBarProps>) {
    if (this.props !== prevProps) {
      this.update();
    }
  }

  private getStats() {
    let deltaTime = Date.now() - this.props.date;
    let currentValue = Math.min(1, this.props.value + (!this.props.paused ? (deltaTime / this.props.duration) : 0));
    let remainingTime = this.props.duration * (1 - this.props.value) - deltaTime;

    return { currentValue, remainingTime };
  }

  private getValue = () => {
    return this.getStats().currentValue;
  }

  private update() {
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
      <ProgressBar
        getValue={this.getValue}
        paused={this.props.paused}
        progressRef={this.ref}
        setValue={this.props.setValue}
        textUpdateInterval={remainingTime / (1 - currentValue) / 100} />
    );
  }
}
