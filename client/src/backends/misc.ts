import type { BaseBackend } from './base';
import { HostBackendOptions } from '../host';
import WebsocketBackend from './websocket';
import { Chip } from './common';


export async function createBackend(options: HostBackendOptions): Promise<BaseBackend> {
  switch (options.type) {
    case 'remote': {
      return new WebsocketBackend(options);
    }
  }
}

export function getChipMetadata(chip: Chip) {
  let runner = chip.runners.metadata as {
    creationDate: number;
    description: string;
    title: string;
  };

  return {
    creationDate: runner.creationDate,
    description: runner.description,
    title: runner.title
  };
}
