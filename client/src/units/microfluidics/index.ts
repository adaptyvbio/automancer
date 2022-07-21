import { Host } from '../../application';
import { Chip } from '../../backends/common';


function providePreview(options: { chip: Chip; host: Host; }) {
  let modelId = options.chip.matrices.microfluidics.modelId;

  if (!modelId) {
    return null;
  }

  let models = options.host.state.executors.microfluidics.models;
  let model = models[modelId];

  return model.previewUrl;
}


export const namespace = 'microfluidics';

export type ModelId = string;

export interface Model {
  id: ModelId;
  name: string;
  diagram: string | null;
  previewUrl: string | null;
  channels: {
    id: string;
    diagramRef: [number, number] | null;
    label: string | null;
    repr: 'barrier' | 'flow' | 'isolate' | 'move' | 'push';
  }[];
  groups: {
    channelIndices: number[];
    label: string | null;
  }[];
}



export interface ExecutorState {
  models: Record<ModelId, Model>;
}

export interface Matrix {
  modelId: ModelId;
}

export default {
  providePreview
}
