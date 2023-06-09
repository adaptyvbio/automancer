import { UnitNamespace } from 'pr1-shared';
import * as React from 'react';

import type { Application } from '../application';
import type { Chip } from '../backends/common';
import type { MenuDef, MenuEntryPath } from '../components/context-menu';
import type { Host } from '../host';
import type { ChipTabComponentProps, NavEntry } from '../units';
import type { ProtocolBlockGraphRendererMetrics, ProtocolBlockGraphRenderer } from './graph';
import type { ProtocolBlock, ProtocolBlockPath } from './protocol';


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
  label: React.ReactNode;
}

export type FeatureGroupDef = Feature[];
export type FeatureListDef = FeatureGroupDef[];


//> Unit

export interface CreateFeaturesOptions {
  host: Host;
}

/** @deprecated */
export interface Unit<Block extends ProtocolBlock = never, Location = never, ProcessData = never> extends BaseUnit {
  createProcessFeatures?(processData: ProcessData, location: unknown | null, options: CreateFeaturesOptions): FeatureGroupDef;
  getChipTabs?(chip: Chip): NavEntry<ChipTabComponentProps>[];
  getGeneralTabs?(): NavEntry<GeneralTabComponentProps>[];
  getProcessLabel?(processData: ProcessData): string | null;
  providePreview?(options: { chip: Chip; host: Host; }): string | null;

  createActiveBlockMenu?(block: Block, location: Location, options: { host: Host; }): MenuDef;
  createDefaultPoint?(block: Block, key: unknown, getChildPoint: (block: ProtocolBlock) => unknown): unknown;
  getActiveChildLocation?(location: Location, key: unknown): unknown;
  getBlockClassLabel?(block: Block): string | null;
  getBlockDefaultLabel?(block: Block, host: Host): string | null;
  getBlockLocationLabelSuffix?(block: Block, location: Location): string | null;
  getChildBlock?(block: Block, key: unknown): ProtocolBlock;
  getChildrenExecutionKeys?(block: Block, location: Location): ProtocolBlockPath | null;
  isBlockBusy?(block: Block, location: Location,  options: { host: Host; }): boolean;
  isBlockPaused?(block: Block, location: Location, options: { host: Host; }): boolean;
  onSelectBlockMenu?(block: Block, location: Location, path: MenuEntryPath): unknown | undefined;

  graphRenderer?: ProtocolBlockGraphRenderer<Block, ProtocolBlockGraphRendererMetrics>;
}


/** @deprecated */
export interface UnitContext {
  host: Host;
}

/** @deprecated */
export interface OptionsComponentProps {
  app: Application;
  baseUrl: string;
  context: UnitContext;
  pathname: string;
}

/** @deprecated */
export interface TabEntry<Props> {
  id: string;
  disabled?: unknown;
  label: string;
  icon: string;
  component: React.ComponentType<Props>;
}

/** @deprecated */
export interface GeneralTabComponentProps {
  app: Application;
  host: Host;
}

/** @deprecated */
export interface BaseUnit {
  namespace: UnitNamespace;

  OptionsComponent?: React.ComponentType<OptionsComponentProps>;
  generalTabs?: TabEntry<GeneralTabComponentProps>[];
  styleSheets?: CSSStyleSheet[];

  /** @deprecated */
  getChipTabs?(chip: Chip): { }[];

  /** @deprecated */
  providePreview?(options: { chip: Chip; host: Host; }): string | null;
}


/** @deprecated */
export interface ProcessComponentProps<Data, Location> {
  context: UnitContext;
  data: Data;
  location: Location;
  time: number;
}

/** @deprecated */
export interface ProcessUnit<Data, Location> extends BaseUnit {
  ProcessComponent?: React.ComponentType<ProcessComponentProps<Data, Location>>;
  createProcessFeatures(data: Data, location: Location | null, context: UnitContext): FeatureGroupDef;
  getProcessLabel(data: Data, context: UnitContext): string | null;
}

/** @deprecated */
export type UnknownProcessUnit = ProcessUnit<unknown, unknown>;


/** @deprecated */
export interface StateUnit<State, Location> extends BaseUnit {
  createStateFeatures(state: State, ancestorStates: State[] | null, location: Location | null, context: UnitContext): FeatureGroupDef;
}

/** @deprecated */
export type UnknownStateUnit = StateUnit<unknown, unknown>;


/** @deprecated */
export interface HeadComponentProps<Block, Location> {
  block: Block;
  context: UnitContext;
  location: Location | null;
}

/** @deprecated */
export interface HeadUnit<Block extends ProtocolBlock, Location> extends BlockUnit<Block, unknown, Location, unknown> {
  HeadComponent: React.ComponentType<HeadComponentProps<Block, Location>>;
}

/** @deprecated */
export type UnknownHeadUnit = HeadUnit<ProtocolBlock | never, unknown>;


/** @deprecated */
export interface BlockUnit<Block extends ProtocolBlock, BlockMetrics, Location, Key> extends BaseUnit {
  graphRenderer: ProtocolBlockGraphRenderer<Block, BlockMetrics, Location>;

  createActiveBlockMenu?(block: Block, location: Location, options: { host: Host; }): MenuDef;
  createDefaultPoint?(block: Block, key: unknown, getChildPoint: (block: ProtocolBlock) => unknown): unknown;
  getActiveChildLocation?(location: Location, id: number): unknown;
  getBlockClassLabel?(block: Block, context: UnitContext): string | null;
  getBlockLabel?(block: Block, location: Location | null, context: UnitContext): React.ReactNode | null;
  getBlockLabelSuffix?(block: Block, location: Location, context: UnitContext): string | null;
  getChildBlock?(block: Block, key: Key): ProtocolBlock;
  getChildrenExecutionRefs(block: Block, location: Location): { blockKey: Key; executionId: number; }[] | null;
  isBlockBusy?(block: Block, location: Location,  options: { host: Host; }): boolean;
  isBlockPaused?(block: Block, location: Location, options: { host: Host; }): boolean;
  onSelectBlockMenu?(block: Block, location: Location, path: MenuEntryPath): unknown | undefined;
}

/** @deprecated */
export type UnknownBlockUnit = BlockUnit<ProtocolBlock | never, unknown, unknown, unknown>;


/** @deprecated */
export type UnknownUnit = BaseUnit
  & (UnknownBlockUnit | {})
  & (UnknownProcessUnit | {})
  & (UnknownStateUnit | {});

/** @deprecated */
export type Units = Record<UnitNamespace, UnknownUnit>;
