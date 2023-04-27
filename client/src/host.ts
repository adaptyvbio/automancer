import type { Client, ClientId, HostId, HostState } from 'pr1-shared';

import type { Units } from './interfaces/unit';


export interface Host {
  client: Client;
  clientId: ClientId;
  state: HostState;
  staticUrl: string | null;
  units: Units;
}
