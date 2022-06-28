import type { ChipModel, ControlNamespace, Master, Protocol, ProtocolSegment } from '../../backends/common';
import type { Features } from '..';


export const namespace = 'input';

export function createFeatures(segment: ProtocolSegment, protocol: Protocol, master?: Master): Features {
  let data = segment.data[namespace];

  return data
    ? [{
      icon: 'keyboard_command_key',
      label: data.message
    }]
    : [];
}

export interface Code {
  arguments: (number | null)[];
}


export default {
  createFeatures
}
