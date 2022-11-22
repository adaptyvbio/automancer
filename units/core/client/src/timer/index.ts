import { CreateFeaturesOptions, Features, formatDuration } from 'pr1';


// export interface ProcessLocationData {
//   progress: number;
// }

export interface ProcessData {
  type: 'duration';
  value: number;
}


const namespace = 'timer';

function createProcessFeatures(processData: ProcessData, options: CreateFeaturesOptions): Features {
  return [{
    icon: 'hourglass_empty',
    label: formatDuration(processData.value)
      // + ((options.location?.segmentIndex === options.segmentIndex)
      //   ? (` (${(options.location.state?.progress ?? 0) * 100}%)`)
      //   : '')
  }];
}


export default {
  createProcessFeatures,
  namespace
} /* satisfies Unit */
