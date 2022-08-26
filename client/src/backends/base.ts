import { Codes, Unit, UnitInfo, UnitNamespace } from '../units';
import type { ChipId, HostState, ProtocolLocation, RunnerCommand } from './common';
import type { DraftCompilation, DraftId } from '../draft';
import { DraftItem } from '../app-backends/base';


export interface BaseBackend {
  closed: Promise<void>;
  state: HostState;

  close(): Promise<void>;
  sync(): Promise<void>;
  start(): Promise<void>;

  onUpdate(listener: () => void, options?: { signal?: AbortSignal; }): void;

  command<T>(options: { chipId: ChipId; command: T; namespace: UnitNamespace; }): Promise<void>;
  compileDraft(options: {
    draftId: DraftId;
    source: string;
  }): Promise<DraftCompilation>;
  createChip(): Promise<{ chipId: ChipId; }>;
  deleteChip(chipId: ChipId): Promise<void>;
  createDraftSample(): Promise<string>;
  instruct<T>(instruction: T): Promise<void>;
  pause(chipId: ChipId, options: { neutral: boolean; }): Promise<void>;
  reloadUnits(): Promise<void>;
  resume(chipId: ChipId): Promise<void>;
  setLocation(chipId: ChipId, location: ProtocolLocation): Promise<void>;
  skipSegment(chipId: ChipId, segmentIndex: number, processState?: object): Promise<void>;
  startPlan(options: {
    chipId: ChipId;
    data: Codes;
    location: ProtocolLocation;
    source: string;
  }): Promise<void>;

  loadUnit(unitInfo: UnitInfo): Promise<Unit<unknown, unknown>>;
}
