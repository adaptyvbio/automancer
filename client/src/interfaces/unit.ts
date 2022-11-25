import type { Chip } from '../backends/common';
import type { Host } from '../host';
import type { ChipTabComponentProps, GeneralTabComponentProps, NavEntry } from '../units';
import type { GraphBlockMetrics, GraphRenderer } from './graph';
import type { Protocol, ProtocolBlock, ProtocolState } from './protocol';


//> General

export type UnitNamespace = string;


//> Feature

export interface Feature {
  accent?: unknown;
  description?: string | null;
  disabled?: unknown;
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
  createStateFeatures?(state: ProtocolState, ancestorStates: ProtocolState[] | null, options: CreateFeaturesOptions): FeatureGroupDef;
  canChipRunProtocol?(protocol: Protocol, chip: Chip): boolean;
  createCode?(protocol: Protocol): unknown;
  getBlockDefaultLabel?(block: ProtocolBlock): string | null;
  getChildBlock?(block: ProtocolBlock, key: unknown): ProtocolBlock;
  getChipTabs?(chip: Chip): NavEntry<ChipTabComponentProps>[];
  getGeneralTabs?(): NavEntry<GeneralTabComponentProps>[];
  providePreview?(options: { chip: Chip; host: Host; }): string | null;

  graphRenderer?: GraphRenderer<ProtocolBlock, GraphBlockMetrics>;
}

export type Units = Record<UnitNamespace, Unit>;
