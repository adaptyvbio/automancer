import { CreateFeaturesOptions, Features, formatDuration } from 'pr1';


export const namespace = 'timer';

export interface ProcessLocationData {
  progress: number;
}

export interface SegmentData {
  duration: number;
}


export function createFeatures(options: CreateFeaturesOptions): Features {
  let segmentData = options.segment.data[namespace] as SegmentData;

  return segmentData
    ? [{
      icon: 'hourglass_empty',
      label: formatDuration(segmentData.duration)
        + ((options.location?.segmentIndex === options.segmentIndex)
          ? (` (${(options.location.state?.progress ?? 0) * 100}%)`)
          : '')
    }]
    : [];
}
