import type { ChannelId, ClientId } from '../client';
import type { ExperimentId, ExperimentReportEventIndex, ExperimentReportEvents, ExperimentReportInfo } from './experiment';
import type { HostIdentifier, HostState } from './host';
import type { MasterId } from './master';
import type { PluginName } from './plugin';
import type { ProtocolBlockPath } from './protocol';
import type { UnionToIntersection } from './util';


export type RequestFunc = UnionToIntersection<
  // Server requests
  (
    (options: { type: 'isBusy'; }) => Promise<boolean>
  )

  // Host requests
  | (
    (options: {
      type: 'compileDraft';
      draft: any;
      options: {
        trusted: boolean;
      };
      studyExperimentId: ExperimentId | null;
    }) => Promise<any>
  ) | (
    (options: {
      type: 'createExperiment';
      title: string;
    }) => Promise<{ experimentId: ExperimentId; }>
  ) | (
    (options: { type: 'createDraftSample'; }) => Promise<string>
  ) | (
    (options: {
      type: 'deleteExperiment';
      experimentId: ExperimentId;
      trash: boolean;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'getExperimentReportInfo';
      experimentId: ExperimentId;
    }) => Promise<ExperimentReportInfo>
  ) | (
    (options: {
      type: 'getExperimentReportEvents';
      eventIndices: ExperimentReportEventIndex[];
      experimentId: ExperimentId;
    }) => Promise<ExperimentReportEvents>
  ) | (
    (options: {
      type: 'reloadUnits';
    }) => Promise<void>
  ) | (
    (options: {
      type: 'requestToExecutor';
      data: unknown;
      namespace: PluginName;
    }) => Promise<unknown>
  ) | (
    (options: {
      type: 'requestToRunner';
      data: unknown;
      experimentId: ExperimentId;
      namespace: PluginName;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'revealExperimentDirectory';
      experimentId: ExperimentId;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'sendMessageToActiveBlock';
      experimentId: ExperimentId;
      path: ProtocolBlockPath;
      message: unknown;
    }) => Promise<void>
  ) | (
    (options: {
      type: 'startDraft';
      draft: any;
      experimentId: ExperimentId;
      options: {
        trusted: boolean;
      };
    }) => Promise<{
      masterId: MasterId;
    }>
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
    clientId: ClientId;
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
