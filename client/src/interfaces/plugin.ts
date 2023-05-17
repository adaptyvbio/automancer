import type { OrdinaryId, PluginName, ProtocolBlock, ProtocolBlockName } from 'pr1-shared';
import type { ComponentType, ReactNode } from 'react';

import type { Application } from '../application';
import type { Host } from '../host';
import type { ProtocolBlockGraphRenderer } from './graph';
import type { FeatureDef } from '../components/features';
import type { Pool } from '../util';
import type { StoreConsumer, StoreEntries } from '../store/types';


export interface PluginSettingsComponentProps<PersistentStoreEntries extends StoreEntries, SessionStoreEntries extends StoreEntries> {
  app: Application;
  context: PluginContext<PersistentStoreEntries, SessionStoreEntries>;
}

export interface Plugin<PersistentStoreEntries extends StoreEntries = [], SessionStoreEntries extends StoreEntries = []> {
  namespace: PluginName;
  styleSheets?: CSSStyleSheet[];

  blocks: Record<ProtocolBlockName, UnknownPluginBlockImpl>;
  persistentStoreDefaults?: PersistentStoreEntries;
  sessionStoreDefaults?: SessionStoreEntries;

  SettingsComponent?: ComponentType<PluginSettingsComponentProps<PersistentStoreEntries, SessionStoreEntries>>;
}

export type UnknownPlugin = Plugin<StoreEntries, StoreEntries>;
export type Plugins = Record<PluginName, UnknownPlugin>;


export interface GlobalContext {
  host: Host;
  pool: Pool;
}

export interface PluginContext<PersistentStoreEntries extends StoreEntries, SessionStoreEntries extends StoreEntries> extends GlobalContext {
  store: StoreConsumer<PersistentStoreEntries, SessionStoreEntries>;
}

export interface BlockContext extends GlobalContext {
  sendMessage(message: unknown): Promise<void>;
}


export interface PluginBlockImplComponentProps<Block extends ProtocolBlock, Location> {
  block: Block;
  context: BlockContext;
  location: Location;
}

export interface PluginBlockImplAction {
  id: OrdinaryId;
  icon: string;
  label?: string;
  onTrigger(): void;
}

export interface PluginBlockImplCommand {
  id: OrdinaryId;
  disabled?: unknown;
  label: string;
  onTrigger(): void;
  shortcut?: string;
}


export interface PluginBlockImpl<Block extends ProtocolBlock, Location> {
  Component?: ComponentType<PluginBlockImplComponentProps<Block, Location>>;

  computeGraph?: ProtocolBlockGraphRenderer<Block, Location>;
  createActions?(block: Block, location: Location, context: BlockContext): PluginBlockImplAction[];
  createCommands?(block: Block, location: Location, context: BlockContext): PluginBlockImplCommand[];
  createFeatures?(block: Block, location: Location | null, context: GlobalContext): FeatureDef[];

  // Missing -> inherits child's point
  // Returns null -> point is null
  createPoint?(block: Block, location: Location | null, child: { key: number; point: unknown; } | null, context: GlobalContext): unknown | null;

  getChildren?(block: Block, context: GlobalContext): ProtocolBlock[];
  getChildrenExecution?(block: Block, location: Location, context: GlobalContext): (PluginBlockExecutionRef | null)[] | null;
  getLabel?(block: Block): ReactNode | null;
}

export interface PluginBlockExecutionRef {
  location: unknown;
}

export type UnknownPluginBlockImpl = PluginBlockImpl<any, any>;
