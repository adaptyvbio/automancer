import * as React from 'react';

import type { Chip } from '../backends/common';
import type { MenuDef, MenuEntryPath } from '../components/context-menu';
import type { Host } from '../host';
import type { ChipTabComponentProps, GeneralTabComponentProps, NavEntry } from '../units';
import type { GraphBlockMetrics, GraphRenderer } from './graph';
import type { MasterBlockLocation, MasterStateLocation, ProtocolBlock, ProtocolBlockPath, ProtocolState } from './protocol';


//> General

export type UnitNamespace = string;


//> Feature

export interface Feature {
  accent?: unknown;
  description?: string | null;
  disabled?: unknown;
  error?: {
    kind: 'emergency' | 'error' | 'power' | 'shield' | 'warning';
    message: string;
  } | null;
  icon: string;
  label: string;
}

export type FeatureGroupDef = Feature[];
export type FeatureListDef = FeatureGroupDef[];


//> Unit

export interface CreateFeaturesOptions {
  host: Host;
}

export interface Unit<Block extends ProtocolBlock = never, Location = never, ProcessData = never> {
  namespace: UnitNamespace;
  styleSheets?: CSSStyleSheet[];

  ProcessComponent?: React.ComponentType<{
    host: Host;
    processData: any;
    processLocation: any;
    time: number;
  }>;

  createProcessFeatures?(processData: ProcessData, options: CreateFeaturesOptions): FeatureGroupDef;
  createStateFeatures?(state: ProtocolState, ancestorStates: ProtocolState[] | null, location: MasterStateLocation, options: CreateFeaturesOptions): FeatureGroupDef;
  getChipTabs?(chip: Chip): NavEntry<ChipTabComponentProps>[];
  getGeneralTabs?(): NavEntry<GeneralTabComponentProps>[];
  getProcessLabel?(processData: ProcessData): string | null;
  providePreview?(options: { chip: Chip; host: Host; }): string | null;

  createActiveBlockMenu?(block: Block, location: Location, options: { host: Host; }): MenuDef;
  createDefaultPoint?(block: Block, key: unknown, getChildPoint: (block: ProtocolBlock) => unknown): unknown;
  getActiveChildLocation?(location: Location, key: unknown): unknown;
  getBlockClassLabel?(block: Block): string | null;
  getBlockDefaultLabel?(block: Block, host: Host): string | null;
  getBlockLocationLabelSuffix?(block: Block, location: unknown): string | null;
  getChildBlock?(block: Block, key: unknown): ProtocolBlock;
  getChildrenExecutionKeys?(block: Block, location: unknown): ProtocolBlockPath | null;
  isBlockBusy?(block: Block, location: Location,  options: { host: Host; }): boolean;
  isBlockPaused?(block: Block, location: Location, options: { host: Host; }): boolean;
  onSelectBlockMenu?(block: Block, location: Location, path: MenuEntryPath): unknown | undefined;

  graphRenderer?: GraphRenderer<Block, GraphBlockMetrics>;
}

export type AnonymousUnit = Unit<ProtocolBlock | never, unknown, unknown>;


export type Units = Record<UnitNamespace, AnonymousUnit>;
