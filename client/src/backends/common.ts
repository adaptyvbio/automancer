import type { BaseBackend } from './base';
import type { DraftCompilation, DraftId } from '../draft';
import type { Codes, ProtocolData, SegmentData, Unit, UnitInfo, UnitNamespace } from '../units';

import type { Master, Protocol, ProtocolBlockPath } from '../interfaces/protocol';
import type { HostDraft, HostDraftCompilerOptions } from '../interfaces/draft';


export abstract class BackendCommon implements BaseBackend {
  private _listeners: Set<() => void> = new Set();

  abstract closed: Promise<void>;
  abstract state: HostState;

  async close(): Promise<void> { }
  async sync(): Promise<void> { }
  async start(): Promise<void> { }

  onUpdate(listener: () => void, options?: { signal?: AbortSignal; }) {
    this._listeners.add(listener);

    options?.signal?.addEventListener('abort', () => {
      this._listeners.delete(listener);
    });
  }

  protected _update() {
    for (let listener of this._listeners) {
      listener();
    }
  }

  abstract command<T>(options: { chipId: ChipId; command: T; namespace: UnitNamespace; }): Promise<void>;
  abstract compileDraft(options: {
    draft: HostDraft;
    options: HostDraftCompilerOptions;
  }): Promise<DraftCompilation>;
  abstract createChip(): Promise<{ chipId: ChipId; }>;
  abstract createDraftSample(): Promise<string>;
  abstract deleteChip(chipId: ChipId, options: { trash: boolean; }): Promise<void>;
  abstract duplicateChip(chipId: ChipId, options: { template: boolean; }): Promise<{ chipId: ChipId; }>;
  abstract instruct<T>(instruction: T): Promise<void>;
  abstract pause(chipId: ChipId, options: { neutral: boolean; }): Promise<void>;
  abstract reloadUnits(): Promise<void>;
  abstract resume(chipId: ChipId): Promise<void>;
  abstract revealChipDirectory(chipId: ChipId): Promise<void>;
  abstract sendMessageToActiveBlock(chipId: ChipId, path: ProtocolBlockPath, message: unknown): Promise<void>;
  abstract setLocation(chipId: ChipId, location: ProtocolLocation): Promise<void>;
  abstract skipSegment(chipId: ChipId, segmentIndex: number, processState?: object): Promise<void>;
  abstract startDraft(options: {
    chipId: ChipId;
    draft: HostDraft;
    options: HostDraftCompilerOptions;
  }): Promise<void>;
  abstract upgradeChip(chipId: ChipId): Promise<void>;

  abstract loadUnit(unitInfo: UnitInfo): Promise<Unit<unknown, unknown>>;
}

export type BackendAuthAgentSpec = {
  type: 'password';
  description: string;
};


export type ChipId = string;
export type DeviceId = string;
export type HostId = string;

export interface Device {
  id: DeviceId;
  name: string;
}


export interface Chip {
  id: ChipId;
  condition: ChipCondition.Ok | ChipCondition.Partial | ChipCondition.Unrunnable;
  issues: ChipIssue[];
  master: Master | null;
  readable: true;
  runners: Record<UnitNamespace, unknown>;
  unitList: UnitNamespace[];
}

export interface UnreadableChip {
  id: ChipId;
  condition: ChipCondition.Unsupported | ChipCondition.Corrupted;
  issues: ChipIssue[];
  readable: false;
}

export type GeneralChip = Chip | UnreadableChip;


export enum ChipCondition {
  Ok = 0,
  Partial = 1,
  Unrunnable = 2,
  Unsupported = 3,
  Corrupted = 4
}

export interface ChipIssue {
  message: string;
}


export type ExecutorStates = Record<UnitNamespace, unknown>;


/**
 * @deprecated
 */
export interface ProtocolLocation {
  segmentIndex: number;
  state: any;
}


export interface HostState {
  info: {
    id: HostId;
    instanceRevision: number;
    name: string;
    startTime: number;
    units: Record<string, UnitInfo>;
  };

  chips: Record<ChipId, GeneralChip>;
  devices: Record<DeviceId, Device>;
  executors: ExecutorStates;
}

export type Namespace = 'control' | 'input' | 'timer';
