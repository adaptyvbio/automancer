import { CreateFeaturesOptions, FeatureGroupDef, ProgressBar, React, Unit, formatDuration, Host } from 'pr1';


export interface ProcessData {
  type: 'duration';
  value: number;
}

export interface ProcessLocation {
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
      <ProgressBar
        duration={props.processData.value}
        paused={props.processLocation.paused}
        time={props.time}
        value={props.processLocation.progress} />
    </div>
  );
}

function createProcessFeatures(processData: ProcessData, options: CreateFeaturesOptions): FeatureGroupDef {
  return [{
    icon: 'hourglass_empty',
    label: formatDuration(processData.value)
  }];
}

function getProcessLabel(processData: ProcessData) {
  return 'Wait';
  // return 'Wait ' + formatDuration(processData.value);
}


export default {
  ProcessComponent,
  createProcessFeatures,
  getProcessLabel,
  namespace
} satisfies Unit
