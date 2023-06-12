import { Experiment, ExperimentId } from './experiment';
import type { PluginName } from './plugin';
import type { PluginInfo } from './unit';
import type { Brand } from './util';


export type HostIdentifier = Brand<string, 'HostIdentifier'>;
export type HostId = Brand<string, 'HostId'>;

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
