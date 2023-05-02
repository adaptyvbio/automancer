import type { PluginName } from './plugin';
import type { Brand, OrdinaryId } from './util';


export interface Protocol {
  name: string | null;
  root: ProtocolBlock;
}

export interface ProtocolBlock {
  name: ProtocolBlockName;
  namespace: PluginName;
  [key: string]: unknown;
}

export type ProtocolBlockName = Brand<string, 'ProtocolBlockName'>;
export type ProtocolBlockPath = OrdinaryId[];

export interface ProtocolProcess {
  data: unknown;
  namespace: PluginName;
}
