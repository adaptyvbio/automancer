import type { Client, ClientId, HostId, HostState } from 'pr1-shared';

import type { Plugins } from './interfaces/plugin';
import type { Units } from './interfaces/unit';


export interface Host {
  client: Client;
  clientId: ClientId;
  plugins: Plugins;
  state: HostState;
  staticUrl: string | null;

  /** @deprecated */
  units: Units;
}
