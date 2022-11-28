import * as React from 'react';

import type { Chip } from '../backends/common';
import type { MenuDef, MenuEntryPath } from '../components/context-menu';
import type { Host } from '../host';
import type { ChipTabComponentProps, GeneralTabComponentProps, NavEntry } from '../units';
import type { GraphBlockMetrics, GraphRenderer } from './graph';
import type { Protocol, ProtocolBlock, ProtocolBlockPath, ProtocolState } from './protocol';


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

  ProcessComponent?: React.ComponentType<{
    host: Host;
    processData: any;
    processState: any;
    time: number;
  }>;

  createProcessFeatures?(processData: unknown, options: CreateFeaturesOptions): FeatureGroupDef;
  createStateFeatures?(state: ProtocolState, ancestorStates: ProtocolState[] | null, options: CreateFeaturesOptions): FeatureGroupDef;
  getChipTabs?(chip: Chip): NavEntry<ChipTabComponentProps>[];
  getGeneralTabs?(): NavEntry<GeneralTabComponentProps>[];
  providePreview?(options: { chip: Chip; host: Host; }): string | null;

  createActiveBlockMenu?(block: ProtocolBlock, execState: unknown): MenuDef;
  getActiveChildState?(execState: unknown, key: unknown): unknown;
  getBlockClassLabel?(block: ProtocolBlock): string | null;
  getBlockDefaultLabel?(block: ProtocolBlock): string | null;
  getChildBlock?(block: ProtocolBlock, key: unknown): ProtocolBlock;
  getChildrenExecutionKeys?(block: ProtocolBlock, execState: unknown): ProtocolBlockPath;
  onSelectBlockMenu?(block: ProtocolBlock, execState: unknown, path: MenuEntryPath): void;
  transformBlockLabel?(block: ProtocolBlock, execState: unknown, label: string): string | null;

  graphRenderer?: GraphRenderer<ProtocolBlock, GraphBlockMetrics>;
}

export type Units = Record<UnitNamespace, Unit>;
