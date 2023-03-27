import { HostIdentifier, HostState } from './host';


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
