import type { Client, HostId, HostState } from 'pr1-shared';

import type { Units } from './interfaces/unit';


export interface Host {
  client: Client;
  id: HostId;
  state: HostState;
  units: Units;
}
