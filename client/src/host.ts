import type { BaseBackend } from './backends/base';
import type { HostId, HostState } from './backends/common';
import { HostSettings } from './interfaces/host';
import { AnonymousUnit, UnitNamespace } from './interfaces/unit';


export interface Host {
  backend: BaseBackend;
  id: HostId;
  state: HostState;
  units: Record<UnitNamespace, AnonymousUnit>;
}

/**
 * @deprecated
 */
export function formatHostSettings(hostSettings: HostSettings): string | null {
  switch (hostSettings.options.type) {
    case 'local': return 'Local';
    case 'remote': return `${hostSettings.options.address}:${hostSettings.options.port}`;
    default: return null;
  }
}
