import type { OrdinaryId, PluginName, ProtocolBlock, ProtocolBlockName, UnitNamespace } from 'pr1-shared';
import type { ComponentType, ReactElement, ReactNode } from 'react';

import type { Application } from '../application';
import type { Host } from '../host';
import type { ProtocolBlockGraphRenderer } from './graph';
import { FeatureDef } from '../components/features';
import { Pool } from '../util';


export interface PluginOptionsComponentProps {
  app: Application;
  baseUrl: string;
  context: GlobalContext;
  pathname: string;
}

export interface Plugin {
  OptionsComponent?: ReactElement<PluginOptionsComponentProps>;
  namespace: UnitNamespace;
  styleSheets?: CSSStyleSheet[];

  blocks: Record<ProtocolBlockName, UnknownPluginBlockImpl>;
}

export type Plugins = Record<PluginName, Plugin>;

export interface GlobalContext {
  host: Host;
  pool: Pool;
}

export interface BlockContext extends GlobalContext {
  sendMessage(message: unknown): Promise<void>;
}


export interface PluginBlockImplComponentProps<Block extends ProtocolBlock, Location> {
  block: Block;
  context: BlockContext;
  location: Location;
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
  createCommands?(block: Block, location: Location, context: BlockContext): PluginBlockImplCommand[];
  // createFeatureMenu?(block: Block, location: Location, context: GlobalContext): never;
  createFeatures?(block: Block, location: Location | null, context: GlobalContext): FeatureDef[];
  getChildren?(block: Block, context: GlobalContext): ProtocolBlock[];
  getChildrenExecution?(block: Block, location: Location, context: GlobalContext): (PluginBlockExecutionRef | null)[];
  getLabel?(block: Block): ReactNode | null;
}

export interface PluginBlockExecutionRef {
  location: unknown;
}

export type UnknownPluginBlockImpl = PluginBlockImpl<any, any>;
