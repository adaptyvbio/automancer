import { ChannelId } from '../client';
import { Chip, ChipId, HostIdentifier, HostState } from './host';
import { ProtocolBlockPath } from './master';
import { UnitNamespace } from './unit';
import { UnionToIntersection } from './util';


export type RequestFunc = UnionToIntersection<
  // Server requests
  (
    (options: { type: 'isBusy'; }) => Promise<boolean>
  )

  // Host requests
  | (
    (options: {
      type: 'command';
      chipId: ChipId;
      command: unknown;
      namespace: UnitNamespace;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'compileDraft';
      draft: any;
      options: any;
    }) => Promise<any>
  ) | (
    (options: { type: 'createChip'; }) => Promise<{ chipId: ChipId; }>
  ) | (
    (options: { type: 'createDraftSample'; }) => Promise<string>
  ) | (
    (options: {
      type: 'deleteChip';
      chipId: ChipId;
      trash: boolean;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'duplicateChip';
      chipId: ChipId;
      template: boolean;
    }) => Promise<void>
  ) | (
    (options: { type: 'reloadUnits'; }) => Promise<void>
  ) | (
    (options: {
      type: 'requestExecutor';
      data: unknown;
      namespace: UnitNamespace;
    }) => Promise<unknown>
  ) | (
    (options: {
      type: 'revealChipDirectory';
      chipId: ChipId;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'sendMessageToActiveBlock';
      chipId: ChipId;
      path: ProtocolBlockPath;
      message: unknown;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'startDraft';
      chipId: ChipId;
      draftId: any;
      source: string;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'upgradeChip';
      chipId: ChipId;
    }) => Promise<void>
  )
>;


export namespace ClientProtocol {
  export interface ChannelMessage {
    type: 'channel';
    id: ChannelId;
    data: unknown;
  }

  export interface ExitMessage {
    type: 'exit';
  }

  export interface RequestMessage {
    type: 'request';
    id: number;
    data: unknown;
  }

  export type Message = ChannelMessage | ExitMessage | RequestMessage;
}

export namespace ServerProtocol {
  export interface ChannelMessage {
    type: 'channel';
    id: ChannelId;
    data: unknown;
  }

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

  export type Message = ChannelMessage | InitializationMessage | ResponseMessage | StateMessage;
}
