import { React, AnonymousUnit, formatDuration, Host, TimedProgressBar, formatDynamicValue, DynamicValue } from 'pr1';


export interface ProcessData {
  value: DynamicValue;
}

export interface ProcessLocation {
  durationQuantity: DynamicValue;
  durationValue: number;
  paused: boolean;
  progress: number;
}


const namespace = 'timer';

function ProcessComponent(props: {
  host: Host;
  processData: ProcessData;
  processLocation: ProcessLocation;
  time: number;
}) {
  return (
    <div>
      <TimedProgressBar
        duration={props.processLocation.durationValue}
        paused={props.processLocation.paused}
        time={props.time}
        value={props.processLocation.progress} />
    </div>
  );
}

function getProcessLabel(processData: ProcessData) {
  return 'Wait';
  // return 'Wait ' + formatDuration(processData.value);
}


export default {
  ProcessComponent,
  getProcessLabel,
  namespace,

  createProcessFeatures(processData: ProcessData, location: ProcessLocation | null, options) {
    return [{
      icon: 'hourglass_empty',
      label: location
        ? formatDynamicValue(location.durationQuantity)
        : formatDynamicValue(processData.value)
    }];
  }
} satisfies AnonymousUnit
