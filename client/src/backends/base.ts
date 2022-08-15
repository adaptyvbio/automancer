import { Codes, Unit, UnitInfo } from '../units';
import type { Chip, ChipId, HostState, ProtocolLocation, RunnerCommand } from './common';
import type { Draft as AppDraft } from '../draft';


export interface BaseBackend {
  closed: Promise<void>;
  state: HostState;

  close(): Promise<void>;
  sync(): Promise<void>;
  start(): Promise<void>;

  onUpdate(listener: () => void, options?: { signal?: AbortSignal; }): void;

  command<T>(chipId: ChipId, command: T): Promise<void>;
  compileDraft(draftId: string, source: string): Promise<NonNullable<AppDraft['compiled']>>;
  createChip(): Promise<{ chipId: ChipId; }>;
  deleteChip(chipId: ChipId): Promise<void>;
  createDraftSample(): Promise<string>;
  pause(chipId: ChipId, options: { neutral: boolean; }): Promise<void>;
  reloadUnits(): Promise<void>;
  resume(chipId: ChipId): Promise<void>;
  setChipMetadata(chipId: ChipId, value: Partial<Chip['metadata']>): Promise<void>;
  setLocation(chipId: ChipId, location: ProtocolLocation): Promise<void>;
  setMatrix(chipId: ChipId, update: Partial<Chip['matrices']>): Promise<void>;
  skipSegment(chipId: ChipId, segmentIndex: number, processState?: object): Promise<void>;
  startPlan(options: {
    chipId: ChipId;
    data: Codes;
    location: ProtocolLocation;
    source: string;
  }): Promise<void>;

  loadUnit(unitInfo: UnitInfo): Promise<Unit<unknown, unknown>>;
}
