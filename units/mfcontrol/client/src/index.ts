/// <reference path="types.d.ts" />

import type { Chip, CreateFeaturesOptions, Features, Host, Protocol } from 'pr1';

import { ManualControl } from './manual-control';
import * as util from './util';
import ReprData from '../../src/pr1_mfcontrol/data/repr.json';
import mainStyles from './index.css' assert { type: 'css' };


export { CodeEditor } from './code-editor';
export { MatrixEditor } from './matrix-editor';

export const namespace = 'mfcontrol';
export const styleSheets = [mainStyles];


export { ReprData };

export type ModelId = string;

export interface Model {
  id: ModelId;
  hash: string;
  name: string;
  diagram: string | null;
  previewUrl: string | null;
  channels: {
    id: string;
    diagramRef: [number, number] | null;
    inverse: boolean;
    label: string | null;
    repr: keyof typeof ReprData['icons'];
  }[];
  groups: {
    channelIndices: number[];
    label: string | null;
  }[];
}

export function getModel(runner: Runner, options: { executor: ExecutorState; }): Model | null {
  return runner.settings.model ?? (runner.settings.modelId ? options.executor.models[runner.settings.modelId] : null);
}


export interface Code {
  arguments: (number | null)[];
}

export type Command = {
  type: 'setModel';
  modelId: ModelId;
} | {
  type: 'setSignal';
  signal: string;
} | {
  type: 'setValveMap';
  valveMap: number[];
}

export interface ExecutorState {
  models: Record<ModelId, Model>;
  valves: { label: string; }[];
}

export interface Runner {
  settings: {
    model: Model | null;
    modelId: ModelId | null;
    valveMap: number[] | null;
  };

  state: {
    signal: string;
    valves: {
      error: number | null;
    }[];
  };
}

export enum RunnerValveError {
  Unbound = 0,
  Disconnected = 1,
  Unwritable = 2
}

export interface ProtocolData {
  entities: Record<string, {
    display: ('delta' | 'active' | 'inactive' | 'never') | null;
    label: string;
    repr: (keyof typeof ReprData.icons) | null;
  }>;
  modelId: ModelId | null;
  parameters: {
    channelIndex: number | null;
    paramIndicesEncoded: string;
  }[];
}

export interface SegmentData {
  paramIndices: number[];
}


export function canChipRunProtocol(protocol: Protocol, chip: Chip): boolean {
  let runner = chip.runners[namespace] as Runner;
  let protocolData = protocol.data[namespace] as ProtocolData;

  // TODO: check model hash instead of id
  return (runner.settings.model !== null) && (!protocolData.modelId || (runner.settings.model.id === protocolData.modelId));
}

export function createCode(protocol: Protocol): Code {
  let protocolData = protocol.data[namespace];

  return {
    arguments: protocolData.parameters.map((param) => {
      return param.channelIndex;
    })
  };
}

export function createFeatures(options: CreateFeaturesOptions): Features {
  let previousSegmentData = options.protocol.segments[options.segmentIndex - 1]?.data[namespace];
  let segmentData = options.segment.data[namespace] as SegmentData;
  let protocolData = options.protocol.data[namespace] as ProtocolData;

  let paramIndicesEncoded = util.encodeIndices(segmentData.paramIndices);
  let previousParamIndicesEncoded = util.encodeIndices(previousSegmentData?.paramIndices ?? []);

  return Object.entries(protocolData.entities).flatMap(([rawEntityParamIndicesEncoded, entity]) => {
    let entityParamIndicesEncoded = BigInt(rawEntityParamIndicesEncoded);

    let active = (entityParamIndicesEncoded & paramIndicesEncoded) === entityParamIndicesEncoded;
    let previousActive = (entityParamIndicesEncoded & previousParamIndicesEncoded) === entityParamIndicesEncoded;

    if (!(
      ((entity.display === 'active') && active)
      || ((entity.display === 'inactive') && !active)
      || ((entity.display === 'delta') && (active !== previousActive))
    )) {
      return [];
    }

    let icon = ReprData.icons[(entity.repr ?? ReprData.default) as (keyof typeof ReprData.icons)];

    return [{
      icon: (entity.display === 'inactive') || ((entity.display === 'delta') && !active)
        ? icon.backwards
        : icon.forwards,
      label: entity.label
    }];
  });
}

export function getChipTabs(chip: Chip) {
  let runner = chip.runners[namespace] as Runner;

  return [
    { id: 'manual',
      label: 'Valve control',
      icon: 'tune',
      disabled: !runner.settings.modelId,
      component: ManualControl }
  ];
}

export function providePreview(options: { chip: Chip; host: Host; }) {
  let executor = options.host.state.executors[namespace] as ExecutorState;
  let runner = options.chip.runners[namespace] as Runner;

  return getModel(runner, { executor })?.previewUrl ?? null;
}
