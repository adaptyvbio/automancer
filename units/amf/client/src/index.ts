/// <reference path="types.d.ts" />

import type { CreateFeaturesOptions, Features } from 'pr1';

import mainStyles from './index.css' assert { type: 'css' };


export const namespace = 'amf';
export const styleSheets = [mainStyles];


export type DeviceId = string;

export interface Device {
  id: DeviceId;
  label: string;
}


export interface ExecutorState {
  devices: Record<DeviceId, Device>;
}

export interface ProcessLocationData {

}

export interface SegmentData {
  valves: Record<DeviceId, number | null>;
}

export function createFeatures(options: CreateFeaturesOptions): Features {
  let executor = options.host.state.executors[namespace] as ExecutorState;
  let segmentData = options.segment.data[namespace] as SegmentData;
  let previousSegmentData = options.protocol.segments[options.segmentIndex - 1]?.data[namespace] as SegmentData | undefined;

  let features = [];

  if (options.segment.processNamespace === namespace) {
    features.push({
      icon: '360',
      label: 'Rotate valves'
    });
  }

  features.push(...Object.values(executor.devices)
    .filter((device) => {
      let valve = segmentData.valves[device.id];
      let previousValve = (previousSegmentData?.valves[device.id] ?? null);
      return valve !== previousValve;
    })
    .map((device) => ({
      icon: '360',
      label: `Valve ${segmentData.valves[device.id]} (${device.label})`
    }))
  );

  return features;
}


export default {
  createFeatures
}
