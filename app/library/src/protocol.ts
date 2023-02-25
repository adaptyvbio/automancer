export namespace Client {
  export interface RequestMessage {
    type: 'request';
    id: number;
    data: unknown;
  }

  export type Message = RequestMessage;
}

export namespace Server {
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

  export type Message = InitializationMessage | ResponseMessage;
}
