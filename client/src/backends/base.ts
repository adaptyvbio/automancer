import type { Codes, Unit, UnitInfo, UnitNamespace } from '../units';
import type { ChipId, HostState, ProtocolLocation } from './common';
import type { DraftCompilation, DraftId } from '../draft';
import type { ProtocolBlockPath } from '../interfaces/protocol';
import type { HostDraft, HostDraftCompilerOptions } from '../interfaces/draft';


export interface BaseBackend {
  closed: Promise<void>;
  state: HostState;

  close(): Promise<void>;
  sync(): Promise<void>;
  start(): Promise<void>;

  onUpdate(listener: () => void, options?: { signal?: AbortSignal; }): void;

  command<T>(options: { chipId: ChipId; command: T; namespace: UnitNamespace; }): Promise<void>;
  compileDraft(options: {
    draft: HostDraft;
    options: HostDraftCompilerOptions;
  }): Promise<DraftCompilation>;
  createChip(): Promise<{ chipId: ChipId; }>;
  createDraftSample(): Promise<string>;
  deleteChip(chipId: ChipId, options: { trash: boolean; }): Promise<void>;
  duplicateChip(chipId: ChipId, options: { template: boolean; }): Promise<{ chipId: ChipId; }>;
  instruct<T>(instruction: T): Promise<void>;
  pause(chipId: ChipId, options: { neutral: boolean; }): Promise<void>;
  reloadUnits(): Promise<void>;
  resume(chipId: ChipId): Promise<void>;
  revealChipDirectory(chipId: ChipId): Promise<void>;
  sendMessageToActiveBlock(chipId: ChipId, path: ProtocolBlockPath, message: unknown): Promise<void>;
  setLocation(chipId: ChipId, location: ProtocolLocation): Promise<void>;
  skipSegment(chipId: ChipId, segmentIndex: number, processState?: object): Promise<void>;
  startDraft(options: {
    chipId: ChipId;
    draft: HostDraft;
    options: HostDraftCompilerOptions;
  }): Promise<void>;
  upgradeChip(chipId: ChipId): Promise<void>;

  loadUnit(unitInfo: UnitInfo): Promise<Unit<unknown, unknown>>;
}
