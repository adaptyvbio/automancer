/// <reference path="types.d.ts" />

import type { CreateFeaturesOptions, Features } from 'pr1';
import { React } from 'pr1';

import mainStyles from './index.css' assert { type: 'css' };


export const namespace = 'amf';
export const styleSheets = [mainStyles];


export interface ProcessLocationData {

}

export interface SegmentData {
  valve: number | null;
}

export function createFeatures(options: CreateFeaturesOptions): Features {
  let segmentData = options.segment.data[namespace] as SegmentData;
  let previousSegmentData = options.protocol.segments[options.segmentIndex - 1]?.data[namespace] as SegmentData | undefined;

  return (segmentData.valve !== null) && (!previousSegmentData || (segmentData.valve !== previousSegmentData.valve))
    ? [{
      icon: '360',
      label: `Valve ${segmentData.valve}`
    }]
    : [];
}


export default {
  createFeatures
}
