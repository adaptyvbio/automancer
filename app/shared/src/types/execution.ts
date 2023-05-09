import { Brand, OrdinaryId } from './util';


export interface ExecutionRef {
  id: ExecutionRefId;
  key: OrdinaryId;
}

export type ExecutionRefId = number;
export type ExecutionRefPath = ExecutionRef[];
