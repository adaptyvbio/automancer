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
  let time = Date.now();
  let currentProgress = props.processLocation.progress + ((time - props.time) / props.processData.value);
  // console.log(currentProgress)

  return (
    <div>
      {/* <pre>{JSON.stringify({ ...props, host: null }, null, 2)}</pre> */}
      <ProgressBar
        paused={props.processLocation.paused}
        targetEndTime={time + (props.processData.value * (1 - currentProgress))}
        time={time}
        value={currentProgress} />
    </div>
  );
}

function createProcessFeatures(processData: ProcessData, options: CreateFeaturesOptions): FeatureGroupDef {
  return [{
    icon: 'hourglass_empty',
    label: formatDuration(processData.value)
      // + ((options.location?.segmentIndex === options.segmentIndex)
      //   ? (` (${(options.location.state?.progress ?? 0) * 100}%)`)
      //   : '')
  }];
}


export default {
  ProcessComponent,
  createProcessFeatures,
  namespace
} satisfies Unit
