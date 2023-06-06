import type { PluginName } from './plugin';
import type { Brand, OrdinaryId } from './util';


export interface Protocol {
  name: string | null;
  root: ProtocolBlock;
}

export interface ProtocolBlock {
  eta: number;
  name: ProtocolBlockName;
  namespace: PluginName;

  [key: string]: unknown;
}

export type ProtocolBlockName = Brand<string, 'ProtocolBlockName'>;
export type ProtocolBlockPath = number[];

export interface ProtocolProcess {
  data: unknown;
  namespace: PluginName;
}
