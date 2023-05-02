import type { ReactNode } from 'react';


export interface Feature {
  accent?: unknown;
  description?: string | null;
  disabled?: unknown;
  error?: {
    kind: 'emergency' | 'error' | 'power' | 'shield' | 'warning';
    message: string;
  } | null;
  icon: string;
  label: ReactNode;
}

export type FeatureGroupDef = Feature[];
export type FeatureListDef = FeatureGroupDef[];
