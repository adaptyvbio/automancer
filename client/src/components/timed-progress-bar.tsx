import { Component } from 'react';

import { ExpandableText } from './expandable-text';
import { ProgressBar } from './progress-bar';
import { TimeSensitive } from './time-sensitive';


export interface TimedProgressBarProps {
  date: number | null; // null => paused
  displayMode?: ProgressDisplayMode;
  duration: number;
  setValue?(newValue: number): void;
  value: number;
}

export interface TimedProgressBarState {

}

export class TimedProgressBar extends Component<TimedProgressBarProps, TimedProgressBarState> {
  private getStats() {
    if (this.props.date !== null) {
      let nowDate = Date.now();
      let endDate = this.props.date + this.props.duration * (1 - this.props.value);

      return {
        currentValue: Math.min(1, this.props.value + ((this.props.date !== null) ? ((nowDate - this.props.date) / this.props.duration) : 0)),
        endDate,
        remainingDuration: endDate - nowDate
      };
    } else {
      return {
        currentValue: this.props.value,
        endDate: null,
        remainingDuration: Infinity
      };
    }
  }

  override shouldComponentUpdate(nextProps: Readonly<TimedProgressBarProps>) {
    return (
      (nextProps.date !== this.props.date) ||
      (nextProps.displayMode !== this.props.displayMode) ||
      (nextProps.duration !== this.props.duration) ||
      (nextProps.value !== this.props.value)
    );
  }

  override render() {
    let { currentValue, endDate, remainingDuration } = this.getStats();
    // console.log('Stats', currentValue, endDate);

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
                      : (endDate !== null)
                        ? (
                          <TimeSensitive
                            contents={() => (
                              <>{(this.getStats().currentValue * 100).toFixed()}</>
                            )}
                            interval={remainingDuration / (1 - currentValue) / 100} />
                        )
                        : <>{(currentValue * 100).toFixed()}</>
                    }
                  </ExpandableText>
                  &thinsp;%
                </div>
              );

            default:
              throw new Error('Not implemented');

/*               case ProgressDisplayMode.TimeElapsed:
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
                ); */
          }
        }}
        endDate={endDate}
        paused={endDate === null}
        setValue={this.props.setValue ?? null}
        value={currentValue} />
    );
  }
}


export enum ProgressDisplayMode {
  Fraction = 0,
  TimeElapsed = 1,
  TimeRemaining = 2
}
