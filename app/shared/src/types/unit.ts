import type { PluginName } from './plugin';


export interface PluginInfo {
  development: boolean;
  enabled: boolean;
  hasClient: boolean;
  namespace: PluginName;
  version: number;

  metadata: {
    author: string | null;
    description: string | null;
    license: string | null;
    title: string | null;
    url: string | null;
    version: string | null;

    icon: {
      kind: 'bitmap' | 'icon' | 'svg';
      value: string;
    } | null;
  };
}
