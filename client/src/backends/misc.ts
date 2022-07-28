import type { BaseBackend } from './base';
import { HostBackendOptions } from '../host';
import type { Draft as AppDraft } from '../draft';
import type { Codes, ExecutorStates, Matrices, OperatorLocationData, ProtocolData, SegmentData } from '../units';
import WebsocketBackend from './websocket';
import { AppBackend } from '../app-backends/base';


export async function createBackend(options: HostBackendOptions): Promise<BaseBackend> {
  switch (options.type) {
    case 'remote': {
      return new WebsocketBackend({
        address: options.address,
        port: options.port,
        secure: options.secure
      });
    }
  }
}
