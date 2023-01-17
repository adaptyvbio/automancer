import { React, UnknownUnit, formatDuration, Host, TimedProgressBar, formatDynamicValue, DynamicValue, ProcessUnit } from 'pr1';


export interface ProcessData {
  value: DynamicValue;
}

export interface ProcessLocation {
  durationQuantity: DynamicValue;
  durationValue: number;
  paused: boolean;
  progress: number;
}


export default {
  namespace: 'timer',

  ProcessComponent(props) {
    return (
      <div>
        <TimedProgressBar
          duration={props.location.durationValue}
          paused={props.location.paused}
          time={props.time}
          value={props.location.progress} />
      </div>
    );
  },

  createProcessFeatures(processData, location, options) {
    return [{
      icon: 'hourglass_empty',
      label: location
        ? formatDynamicValue(location.durationQuantity)
        : formatDynamicValue(processData.value)
    }];
  },
  getProcessLabel(data, context) {
    return 'Wait';
  }
} satisfies ProcessUnit<ProcessData, ProcessLocation>
