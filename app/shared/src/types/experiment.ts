import type { CompilationAnalysis } from './compilation';
import type { Master, MasterAnalysis } from './master';
import type { PluginName } from './plugin';
import type { ProtocolBlock } from './protocol';
import type { Brand } from './util';


export type ExperimentId = Brand<string, 'PastExperimentId'>;


export interface Experiment {
  id: ExperimentId;
  creationDate: number;
  hasReport: boolean;
  master: Master | null;
  runners: Record<PluginName, unknown>;
  title: string;
}

export interface ExperimentReportInfo {
  initialAnalysis: CompilationAnalysis;
  draft: any;
  masterAnalysis: MasterAnalysis;
  name: string;
  root: ProtocolBlock;
  rootStaticEntry: ExperimentReportStaticEntry;
}

export interface ExperimentReportStaticEntry {
  accessCount: number;
  accesses: [number, number];
  children: Record<number, ExperimentReportStaticEntry>;
}
