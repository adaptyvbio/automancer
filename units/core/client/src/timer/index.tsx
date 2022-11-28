import { CreateFeaturesOptions, FeatureGroupDef, ProgressBar, React, Unit, formatDuration } from 'pr1';


export interface ProcessData {
  type: 'duration';
  value: number;
}

export interface ProcessState {
  paused: boolean;
  progress: number;
}


const namespace = 'timer';

function ProcessComponent(props: {
  processData: ProcessData;
  processState: ProcessState;
  time: number;
}) {
  let time = Date.now();
  let currentProgress = props.processState.progress + ((time - props.time) / props.processData.value);
  // console.log(currentProgress)

  return (
    <div>
      <p>Progress: 0%</p>
      <pre>{JSON.stringify({ ...props, host: null }, null, 2)}</pre>
      <ProgressBar
        paused={props.processState.paused}
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
