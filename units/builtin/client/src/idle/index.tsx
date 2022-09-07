import type { CreateFeaturesOptions, Features } from 'pr1';


export const namespace = 'idle';

export interface ProcessLocationData {

}

export interface Code {
  arguments: (number | null)[];
}

export interface SegmentData {
  message: string;
}


export function createFeatures(options: CreateFeaturesOptions): Features {
  let segmentData = options.segment.data[namespace] as SegmentData;

  return segmentData
    ? [{
      icon: 'keyboard_command_key',
      label: segmentData.message
    }]
    : [];
}


export default {
  createFeatures
}
