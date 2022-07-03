import { CodeEditor } from './code-editor';
import { MatrixEditor } from './matrix-editor';
import type { Features } from '..';
import type { ChipId, ChipModel, ControlNamespace, Master, Protocol, ProtocolSegment } from '../../backends/common';
import * as util from '../../util';


const EntityReprIcon = {
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


export const namespace = 'control';

export interface Code {
  arguments: (number | null)[];
}

export interface Matrix {
  valves: {
    aliases: string[];
    hostValveIndex: number;
  }[];
}

export interface ProtocolData {
  entities: Record<string, {
    display: ('delta' | 'active' | 'inactive' | 'never') | null;
    label: string;
    repr: (keyof typeof EntityReprIcon) | null;
  }>;
  parameters: {
    defaultValveIndices: Record<ChipId, number> | null;
    paramIndicesEncoded: string;
  }[];
}

export interface SegmentData {
  paramIndices: number[];
}


export function createCode(protocol: Protocol, model: ChipModel): ControlNamespace.Code {
  return {
    arguments: protocol.data.control!.parameters.map((param) => {
      return param.defaultValveIndices?.[model.id] ?? null;
    })
  };
}


export function createFeatures(segmentIndex: number, segment: ProtocolSegment, protocol: Protocol, master?: Master): Features {
  let previousSegmentData = protocol.segments[segmentIndex - 1]?.data[namespace];
  let segmentData = segment.data[namespace];
  let protocolData = protocol.data[namespace];

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

    let icon = EntityReprIcon[entity.repr ?? 'flow'];

    return [{
      icon: (entity.display === 'inactive') || ((entity.display === 'delta') && !active)
        ? icon.backwards
        : icon.forwards,
      label: entity.label
    }];
  });
}


export default {
  CodeEditor,
  MatrixEditor,
  createCode,
  createFeatures
}
