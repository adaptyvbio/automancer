import type { HostState } from 'pr1';


export namespace ClientProtocol {
  export interface RequestMessage {
    type: 'request';
    id: number;
    data: unknown;
  }

  export type Message = RequestMessage;
}

export namespace ServerProtocol {
  export interface InitializationMessage {
    type: 'initialize';
    identifier: string;
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
