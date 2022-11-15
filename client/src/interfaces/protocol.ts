import type { UnitNamespace } from './unit';


export interface Protocol {
  name: string | null;
  root: ProtocolBlock;
}

export interface ProtocolBlock {
  namespace: UnitNamespace;
  [key: string]: unknown;
}

export interface ProtocolSegment {
  process: ProtocolProcess;
  state: ProtocolState;
}

export interface ProtocolProcess {
  data: unknown;
  namespace: UnitNamespace;
}

export type ProtocolState = Record<UnitNamespace, unknown>;
