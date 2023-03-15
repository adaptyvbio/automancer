import { Master } from './master';
import { UnitInfo, UnitNamespace } from './unit';
import type { Brand } from './util';


export type HostIdentifier = Brand<string, 'HostIdentifier'>;


export type BackendAuthAgentSpec = {
  type: 'password';
  description: string;
};


export type ChipId = Brand<string, 'ChipId'>;
export type DeviceId = Brand<string, 'DeviceId'>;
export type HostId = Brand<string, 'HostId'>;

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
