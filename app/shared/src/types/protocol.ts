import { Chip, ChipId, HostIdentifier, HostState } from './host';
import { UnionToIntersection } from './util';


export type ReqResPairs = [
  // Server requests
  [
    { type: 'isBusy', },
    boolean
  ],

  // Host requests
  [
    { type: 'createChip'; },
    { chipId: ChipId; }
  ],
  [
    { type: 'createDraftSample'; },
    string
  ],
  [
    { type: 'deleteChip';
      chipId: ChipId;
      trash: boolean; },
    void
  ],
  [
    { type: 'duplicateChip';
      chipId: ChipId;
      template: boolean; },
    void
  ],
  [
    { type: 'reloadUnits'; },
    void
  ],
  [
    { type: 'revealChipDirectory';
      chipId: ChipId; },
    void
  ],
  [
    { type: 'upgradeChip';
      chipId: ChipId; },
    void
  ]
];

export type RequestFuncFromPair<T extends [unknown, unknown]> = (request: T[0]) => Promise<T[1]>;
export type RequestFuncT<T extends [unknown, unknown][]> = UnionToIntersection<{
  [S in keyof T]: RequestFuncFromPair<T[S]>;
}[number]>;
export type RequestFunc = RequestFuncT<ReqResPairs>;


export namespace ClientProtocol {
  export interface ExitMessage {
    type: 'exit';
  }

  export interface RequestMessage {
    type: 'request';
    id: number;
    data: unknown;
  }

  export type Message = ExitMessage | RequestMessage;
}

export namespace ServerProtocol {
  export interface InitializationMessage {
    type: 'initialize';
    identifier: HostIdentifier;
    staticUrl: string | null;
    version: number;
  }

  export interface ResponseMessage {
    type: 'response';
    id: number;
    data: unknown;
  }

  export interface StateMessage {
    type: 'state';
    data: HostState;
  }

  export type Message = InitializationMessage | ResponseMessage | StateMessage;
}
