import type { ControlNamespace, Protocol } from '../../backends/common';


export { CodeEditor } from './code-editor';

export function createCode(protocol: Protocol): ControlNamespace.Code {
  return {
    arguments: protocol.data.control!.parameters.map(() => null)
  };
}

export interface Code {
  arguments: (number | null)[];
}
