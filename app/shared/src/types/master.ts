import type { DiagnosticReference } from './analysis';
import type { PluginName } from './plugin';
import type { Protocol } from './protocol';


/** @deprecated */
export interface ProtocolBlock {
  namespace: PluginName;
  [key: string]: unknown;
}

/** @deprecated */
export type ProtocolBlockPath = unknown[];

export interface ProtocolProcess {
  data: unknown;
  namespace: PluginName;
}

export type ProtocolState = Record<PluginName, unknown>;


export interface ProtocolBlockAggregate {
  blocks: ProtocolBlock[];
  offset: number;
  state: ProtocolState | null;
}


export interface ProtocolError {
  id: string | null;
  description: string[];
  message: string;
  references: DiagnosticReference[];
}


export interface Master {
  analysis: MasterAnalysis;
  location: unknown;
  protocol: Protocol;
}

export interface MasterAnalysis {
  errors: MasterError[];
  warnings: MasterError[];
}

export interface MasterError extends ProtocolError {
  id: string;
  date: number;
  path: ProtocolBlockPath;
}

export interface MasterProcessState {
  time: number;
  [key: string]: unknown;
}

export type MasterStateLocation = Record<PluginName, unknown> | null;
