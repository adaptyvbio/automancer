import * as React from 'react';

import * as util from '../util';


interface ProgressBarProps {
  paused?: unknown;
  setValue(newValue: number): void;
  targetEndTime?: number;
  value: number;
}

interface ProgressBarState {
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

      this.animation = this.ref.current!.animate([
        { width: `${this.props.value * 100}%` },
        { width: '100%' }
      ], { duration, fill: 'forwards' });
    }
  }

  render() {
    return (
      <div className={util.formatClass('pbar-root', { '_paused': this.props.paused })}>
        <div className="pbar-outer"
          onMouseMove={(event) => {
            let inner = event.currentTarget.firstChild as HTMLDivElement;
            let innerRect = inner.getBoundingClientRect();

            let value = (event.clientX - innerRect.x) / innerRect.width;
            value = Math.min(1, Math.max(0, value));

            this.setState({ selectValue: value });
          }}
          onMouseLeave={() => {
            this.setState({ selectValue: null });
          }}
          onClick={() => {
            this.props.setValue(this.state.selectValue!);
          }}>
          <div className="pbar-inner" />
          <div className="pbar-progress" style={{ width: `${this.props.value * 100}%` }} ref={this.ref} />
          {this.state.selectValue !== null && (
            <div className="pbar-select" style={{ width: `${this.state.selectValue * 100}%` }} />
          )}
        </div>
        <div className="pbar-text">{((this.state.selectValue ?? this.props.value) * 100).toFixed(0)}%</div>
      </div>
    )
  }
}
