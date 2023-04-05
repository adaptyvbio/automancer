import { Brand } from './util';


export type UnitNamespace = Brand<string, 'UnitNamespace'>;

export interface UnitInfo {
  development: boolean;
  enabled: boolean;
  hasClient: boolean;
  namespace: UnitNamespace;
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
