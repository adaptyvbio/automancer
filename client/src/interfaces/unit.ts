import type { Chip } from '../backends/common';
import type { Host } from '../host';
import type { ChipTabComponentProps, GeneralTabComponentProps, NavEntry } from '../units';
import type { GraphBlockMetrics, GraphRenderer } from './graph';
import type { Protocol, ProtocolBlock, ProtocolState } from './protocol';


//> General

export type UnitNamespace = string;


//> Feature

export interface Feature {
  description?: string | null;
  icon: string;
  label: string;
}

export type FeatureGroupDef = Feature[];
export type FeatureListDef = FeatureGroupDef[];


//> Unit

export interface CreateFeaturesOptions {
  host: Host;
}

export interface Unit {
  namespace: UnitNamespace;
  styleSheets?: CSSStyleSheet[];

  createProcessFeatures?(processData: unknown, options: CreateFeaturesOptions): FeatureGroupDef;
  createStateFeatures?(state: ProtocolState, options: CreateFeaturesOptions): FeatureGroupDef;
  canChipRunProtocol?(protocol: Protocol, chip: Chip): boolean;
  createCode?(protocol: Protocol): unknown;
  getChipTabs?(chip: Chip): NavEntry<ChipTabComponentProps>[];
  getGeneralTabs?(): NavEntry<GeneralTabComponentProps>[];
  providePreview?(options: { chip: Chip; host: Host; }): string | null;

  graphRenderer?: GraphRenderer<ProtocolBlock, GraphBlockMetrics>;
}

export type Units = Record<UnitNamespace, Unit>;
