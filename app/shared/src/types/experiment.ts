import type { CompilationAnalysis } from './compilation';
import type { Master, MasterAnalysis, MasterBlockLocation } from './master';
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
  draft: any;
  endDate: number;
  initialAnalysis: CompilationAnalysis;
  masterAnalysis: MasterAnalysis;
  name: string;
  root: ProtocolBlock;
  rootStaticEntry: ExperimentReportStaticEntry;
  startDate: number;
}

export interface ExperimentReportStaticEntry {
  accessCount: number;
  accesses: [ExperimentReportEventIndex, ExperimentReportEventIndex][];
  children: Record<number, ExperimentReportStaticEntry>;
}

export type ExperimentReportEventIndex = Brand<number, 'ExperimentReportEventIndex'>;

export interface ExperimentReportEvent {
  date: number;
  location: MasterBlockLocation | null;
}

export type ExperimentReportEvents = Record<ExperimentReportEventIndex, ExperimentReportEvent>;
