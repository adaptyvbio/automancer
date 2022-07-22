import type { CreateFeaturesOptions, Features } from '..';


export const namespace = 'local_notification';


export interface SegmentData {
  message: string;
}


export function createFeatures(options: CreateFeaturesOptions): Features {
  let segmentData = options.segment.data[namespace];

  return segmentData
    ? [{
      icon: 'textsms',
      label: segmentData.message
    }]
    : [];
}


export default {
  createFeatures
}
