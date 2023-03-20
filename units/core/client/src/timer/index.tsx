import { React, TimedProgressBar, formatDynamicValue, DynamicValue, ProcessUnit } from 'pr1';


export interface ProcessData {
  duration: DynamicValue;
}

export interface ProcessLocation {
  duration: {
    quantity: DynamicValue;
    value: number;
  } | null;
  paused: boolean;
  progress: number;
}


export default {
  namespace: 'timer',

  ProcessComponent(props) {
    if (!props.location.duration) {
      return null;
    }

    return (
      <div>
        <TimedProgressBar
          duration={props.location.duration.value}
          paused={props.location.paused}
          time={props.time}
          value={props.location.progress} />
      </div>
    );
  },

  createProcessFeatures(processData, location, options) {
    return [{
      icon: 'hourglass_empty',
      label: (
        location
          ? (location.duration && formatDynamicValue(location.duration.quantity))
          : (!((processData.duration.type === 'string') && (processData.duration.value === 'forever')) ? formatDynamicValue(processData.duration) : null)
      ) ?? 'Foorever'
    }];
  },
  getProcessLabel(data, context) {
    return 'Wait';
  }
} satisfies ProcessUnit<ProcessData, ProcessLocation>
