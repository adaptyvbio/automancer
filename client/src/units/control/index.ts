import { CodeEditor } from './code-editor';
import { MatrixEditor } from './matrix-editor';
import type { CreateFeaturesOptions, Features } from '..';
import type { Chip, Protocol } from '../../backends/common';
import * as util from '../../util';
import { Host } from '../../application';


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


export const namespace = 'control';

export interface Code {
  arguments: (number | null)[];
}

export interface ExecutorState {
  models: Record<ModelId, Model>;
  valves: Record<string, number>;
}

export interface Matrix {
  modelId: ModelId | null;
  valves: {
    hostValveIndex: number;
  }[] | null;
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


export function canChipRunProtocol(protocol: Protocol, chip: Chip): boolean {
  let matrix = chip.matrices[namespace];
  let protocolData = protocol.data[namespace];

  return (matrix.modelId !== null) && (!protocolData.modelId || (matrix.modelId === protocolData.modelId));
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
  let segmentData = options.segment.data[namespace];
  let protocolData = options.protocol.data[namespace];

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


export function providePreview(options: { chip: Chip; host: Host; }) {
  let modelId = options.chip.matrices[namespace].modelId;

  if (!modelId) {
    return null;
  }

  let models = options.host.state.executors[namespace].models;
  let model = models[modelId];

  return model.previewUrl;
}


export default {
  CodeEditor,
  MatrixEditor,

  canChipRunProtocol,
  createCode,
  createFeatures,
  providePreview
}
