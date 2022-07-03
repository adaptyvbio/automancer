import type { CreateFeaturesOptions, Features } from '..';
import { formatDuration } from '../../format';


export const namespace = 'timer';

export interface OperatorLocationData {
  progress: number;
}

export interface SegmentData {
  duration: number;
}


export function createFeatures(options: CreateFeaturesOptions): Features {
  let segmentData = options.segment.data[namespace];

  return segmentData
    ? [{
      icon: 'hourglass_empty',
      label: formatDuration(segmentData.duration)
        + ((options.location?.segmentIndex === options.segmentIndex)
          ? (` (${(options.location.data?.progress ?? 0) * 100}%)`)
          : '')
    }]
    : [];
}


export default {
  createFeatures
}
