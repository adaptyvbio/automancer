import type { Client, HostId, HostState } from 'pr1-shared';

import type { Plugins } from './interfaces/plugin';
import type { Units } from './interfaces/unit';


export interface Host {
  client: Client;
  id: HostId;
  plugins: Plugins;
  state: HostState;
  staticUrl: string | null;

  /** @deprecated */
  units: Units;
}
