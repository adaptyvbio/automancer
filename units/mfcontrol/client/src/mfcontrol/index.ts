/// <reference path="types.d.ts" />

import type { Chip, CreateFeaturesOptions, Features, Host, Protocol } from 'pr1';

// import { CodeEditor } from './code-editor';
import { ManualControl } from './manual-control';
import * as util from './util';
import mainStyles from './index.css' assert { type: 'css' };


export { MatrixEditor } from './matrix-editor';

export const namespace = 'mfcontrol';
export const styleSheets = [mainStyles];


export const ReprIcon = {
  'barrier': {
    forwards: 'vertical_align_center',
    backwards: '-vertical_align_center'
  },
  'flow': {
    forwards: 'air',
    backwards: '-air'
  },
  'isolate': {
    forwards: 'view_column',
    backwards: '-view_column'
  },
  'move': {
    forwards: 'moving',
    backwards: '-moving'
  },
  'push': {
    forwards: 'download',
    backwards: 'upload'
  },
  'subset': {
    forwards: 'table_rows',
    backwards: '-table_rows'
   }
};


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
    repr: 'barrier' | 'flow' | 'isolate' | 'move' | 'push';
  }[];
  groups: {
    channelIndices: number[];
    label: string | null;
  }[];
}


export interface Code {
  arguments: (number | null)[];
}

export type Command = {
  type: 'setModel';
  modelId: ModelId;
} | {
  type: 'setValveMap';
  valveMap: number[];
}

export interface Executor {
  models: Record<ModelId, Model>;
  valves: { label: string; }[];
}

export interface Runner {
  settings: {
    model: Model | null;
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
  Disconnected = 1
}

export interface ProtocolData {
  entities: Record<string, {
    display: ('delta' | 'active' | 'inactive' | 'never') | null;
    label: string;
    repr: (keyof typeof ReprIcon) | null;
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


// export function canChipRunProtocol(protocol: Protocol, chip: Chip): boolean {
//   let matrix = chip.matrices[namespace];
//   let protocolData = protocol.data[namespace];

//   return (matrix.modelId !== null) && (!protocolData.modelId || (matrix.modelId === protocolData.modelId));
// }

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

    let icon = ReprIcon[entity.repr ?? 'flow'];

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
      disabled: !runner.settings.model,
      component: ManualControl }
  ];
}

export function providePreview(options: { chip: Chip; host: Host; }) {
  let runner = options.chip.runners[namespace] as Runner;
  return runner.settings.model?.previewUrl ?? null;
}
