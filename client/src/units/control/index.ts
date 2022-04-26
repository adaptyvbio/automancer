import type { ChipModel, ControlNamespace, Master, Protocol, ProtocolSegment } from '../../backends/common';


export { CodeEditor } from './code-editor';

export const namespace = 'control';

export function createCode(protocol: Protocol, model: ChipModel): ControlNamespace.Code {
  return {
    arguments: protocol.data.control!.parameters.map((param) => {
      return param.defaultValveIndices?.[model.id] ?? null;
    })
  };
}

export function createFeatures(segment: ProtocolSegment, protocol: Protocol, master?: Master): {
  icon: string;
  label: string;
}[] {
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
      icon: ({
        'flow': 'air',
        'push': 'download',
        'unpush': 'upload'
      } as any)[argData?.repr ?? param.repr ?? 'flow'],
      label: param.label
    }];
  });
}

export interface Code {
  arguments: (number | null)[];
}
