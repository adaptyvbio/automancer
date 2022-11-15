import type { Chip } from '../backends/common';
import type { Host } from '../host';
import type { ChipTabComponentProps, GeneralTabComponentProps, NavEntry } from '../units';
import type { GraphBlockMetrics, GraphRenderer } from './graph';
import type { Protocol, ProtocolBlock } from './protocol';


//> General

export type UnitNamespace = string;


//> Feature

export interface Feature {
  icon: string;
  label: string;
}

export type Features = Feature[];


//> Unit

export interface CreateFeaturesOptions {

}

export type BlockState = Record<UnitNamespace, unknown>;

export interface Unit {
  namespace: UnitNamespace;
  styleSheets?: CSSStyleSheet[];

  createProcessFeatures?(processData: unknown, options: CreateFeaturesOptions): Features;
  createStateFeatures?(stateData: BlockState, options: CreateFeaturesOptions): Features;
  canChipRunProtocol?(protocol: Protocol, chip: Chip): boolean;
  createCode?(protocol: Protocol): unknown;
  getChipTabs?(chip: Chip): NavEntry<ChipTabComponentProps>[];
  getGeneralTabs?(): NavEntry<GeneralTabComponentProps>[];
  providePreview?(options: { chip: Chip; host: Host; }): string | null;

  graphRenderer?: GraphRenderer<ProtocolBlock, GraphBlockMetrics>;
}

export type Units = Record<UnitNamespace, Unit>;
