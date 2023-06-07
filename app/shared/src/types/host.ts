import type { Master } from './master';
import type { PluginName } from './plugin';
import type { ProtocolBlock } from './protocol';
import type { PluginInfo } from './unit';
import type { Brand } from './util';


export type HostIdentifier = Brand<string, 'HostIdentifier'>;
export type ExperimentId = Brand<string, 'PastExperimentId'>;
export type HostId = Brand<string, 'HostId'>;


export interface Experiment {
  id: ExperimentId;
  creationDate: number;
  hasReport: boolean;
  master: Master | null;
  runners: Record<PluginName, unknown>;
  title: string;
}

export interface ExperimentReportHeader {
  name: string;
  root: ProtocolBlock;
}

export interface HostState {
  info: {
    id: HostId;
    instanceRevision: number;
    name: string;
    startTime: number;
    units: Record<string, PluginInfo>;
  };

  executors: Record<PluginName, unknown>;
  experiments: Record<ExperimentId, Experiment>;
}
