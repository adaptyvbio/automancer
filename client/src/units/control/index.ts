import type { ChipModel, ControlNamespace, Master, Protocol, ProtocolSegment } from '../../backends/common';
import type { Features } from '..';


import { CodeEditor } from './code-editor';
import { MatrixEditor } from './matrix-editor';


export const namespace = 'control';

export function createCode(protocol: Protocol, model: ChipModel): ControlNamespace.Code {
  return {
    arguments: protocol.data.control!.parameters.map((param) => {
      return param.defaultValveIndices?.[model.id] ?? null;
    })
  };
}

export function createFeatures(segment: ProtocolSegment, protocol: Protocol, master?: Master): Features {
  let data = segment.data[namespace]!;
  let protodata = protocol.data[namespace]!;
  let supdata = (master as any)?.supdata[namespace];

  return data.valves.flatMap((paramIndex) => {
    let param = protodata.parameters[paramIndex];
    let argData = supdata?.arguments[paramIndex];

    if ((argData ? argData.display : param.display) === 'hidden') {
      return [];
    }

    return [{
      icon: 'air' /* ({
        'flow': 'air',
        'push': 'download',
        'unpush': 'upload'
      } as any)[argData?.repr ?? param.repr ?? 'flow'] */,
      label: param.label
    }];
  });
}

export interface Code {
  arguments: (number | null)[];
}

export interface Matrix {
  valves: {
    aliases: string[];
    hostValveIndex: number;
  }[];
}


export default {
  CodeEditor,
  MatrixEditor,
  createCode,
  createFeatures
}
