import type { UnitNamespace } from './unit';


export interface Protocol {
  name: string | null;
  root: ProtocolBlock;
}

export interface ProtocolBlock {
  namespace: UnitNamespace;
  [key: string]: unknown;
}

export type ProtocolBlockPath = unknown[];

export interface ProtocolProcess {
  data: unknown;
  namespace: UnitNamespace;
}

export type ProtocolState = Record<UnitNamespace, unknown>;


export interface ProtocolBlockAggregate {
  blocks: ProtocolBlock[];
  offset: number;
  state: ProtocolState | null;
}


export interface Master {
  location: MasterBlockLocation;
  protocol: Protocol;
}

export interface MasterProcessState {
  time: number;
  [key: string]: unknown;
}

export type MasterStateLocation = Record<UnitNamespace, unknown> | null;

export interface MasterBlockLocation {
  state: MasterStateLocation;
}
