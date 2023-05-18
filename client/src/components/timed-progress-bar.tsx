import * as React from 'react';

import { ProgressBar } from './progress-bar';
import { ExpandableText } from './expandable-text';
import { TimeSensitive } from './time-sensitive';
import { formatDuration } from '../format';


export interface TimedProgressBarProps {
  date: number;
  displayMode?: ProgressDisplayMode;
  duration: number;
  paused?: unknown;
  setValue?(newValue: number): void;
  value: number;
}

export interface TimedProgressBarState {

}

export class TimedProgressBar extends React.Component<TimedProgressBarProps, TimedProgressBarState> {
  private getStats() {
    let nowDate = Date.now();
    let currentValue = Math.min(1, this.props.value + (!this.props.paused ? ((nowDate - this.props.date) / this.props.duration) : 0));
    let endDate = this.props.date + this.props.duration * (1 - this.props.value);
    let remainingDuration = endDate - nowDate;

    return { currentValue, endDate, remainingDuration };
  }

  override render() {
    let { currentValue, endDate, remainingDuration } = this.getStats();

    return (
      <ProgressBar
        description={(selectValue) => {
          switch (this.props.displayMode ?? ProgressDisplayMode.Fraction) {
            case ProgressDisplayMode.Fraction:
              return (
                <div>
                  <ExpandableText expandedValue="100">
                    {(selectValue !== null)
                      ? (
                        <>{(selectValue * 100).toFixed()}</>
                      )
                      : (
                        <TimeSensitive
                          contents={() => (
                            <>{(this.getStats().currentValue * 100).toFixed()}</>
                          )}
                          interval={remainingDuration / (1 - currentValue) / 100} />
                      )}
                  </ExpandableText>
                  &thinsp;%
                </div>
              );

              case ProgressDisplayMode.TimeElapsed:
                return (selectValue !== null)
                  ? (
                    <div>{formatDuration((this.props.duration * selectValue), { style: 'numeric' })}</div>
                  )
                  : (
                    <TimeSensitive
                      contents={() => (
                        <div>{formatDuration(this.props.duration - this.getStats().remainingDuration, { style: 'numeric' })}</div>
                      )}
                      interval={1000} />
                );

              case ProgressDisplayMode.TimeRemaining:
                return (selectValue !== null)
                  ? (
                    <div>{formatDuration((this.props.duration * (1 - selectValue)), { style: 'numeric' })}</div>
                  )
                  : (
                    <TimeSensitive
                      contents={() => (
                        <div>{formatDuration(this.getStats().remainingDuration, { style: 'numeric' })}</div>
                      )}
                      interval={1000} />
                );
          }
        }}
        endDate={!this.props.paused ? endDate : null}
        paused={this.props.paused}
        setValue={this.props.setValue}
        value={currentValue} />
    );
  }
}


export enum ProgressDisplayMode {
  Fraction = 0,
  TimeElapsed = 1,
  TimeRemaining = 2
}
