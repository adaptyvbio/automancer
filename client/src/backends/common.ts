import type { UnitNamespace } from 'pr1-shared';
import type { Master } from '../interfaces/protocol';


/** @deprecated */
export type ChipId = string;

/** @deprecated */
export type HostId = string;


/** @deprecated */
export interface Chip {
  id: ChipId;
  condition: ChipCondition.Ok | ChipCondition.Partial | ChipCondition.Unrunnable;
  issues: ChipIssue[];
  master: Master | null;
  readable: true;
  runners: Record<UnitNamespace, unknown>;
  unitList: UnitNamespace[];
}

/** @deprecated */
export interface UnreadableChip {
  id: ChipId;
  condition: ChipCondition.Unsupported | ChipCondition.Corrupted;
  issues: ChipIssue[];
  readable: false;
}

/** @deprecated */
export type GeneralChip = Chip | UnreadableChip;


/** @deprecated */
export enum ChipCondition {
  Ok = 0,
  Partial = 1,
  Unrunnable = 2,
  Unsupported = 3,
  Corrupted = 4
}

/** @deprecated */
export interface ChipIssue {
  message: string;
}


/** @deprecated */
export interface ProtocolLocation {
  segmentIndex: number;
  state: any;
}
