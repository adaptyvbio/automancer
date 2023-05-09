import type { OrdinaryId, PluginName, ProtocolBlock, ProtocolBlockName, UnitNamespace } from 'pr1-shared';
import type { ComponentType, ReactElement, ReactNode } from 'react';

import type { Application } from '../application';
import type { MenuDef } from '../components/context-menu';
import type { Host } from '../host';
import type { Feature } from './feature';
import type { ProtocolBlockGraphRenderer } from './graph';


export interface PluginOptionsComponentProps {
  app: Application;
  baseUrl: string;
  context: PluginContext;
  pathname: string;
}

export interface Plugin {
  OptionsComponent?: ReactElement<PluginOptionsComponentProps>;
  namespace: UnitNamespace;
  styleSheets?: CSSStyleSheet[];

  blocks: Record<ProtocolBlockName, UnknownPluginBlockImpl>;
}

export type Plugins = Record<PluginName, Plugin>;

export interface PluginContext {
  host: Host;
}


export interface PluginBlockEntry {
  id?: OrdinaryId;
  features: Feature[];
}

export interface PluginBlockImplComponentProps<Block extends ProtocolBlock, Location> {
  block: Block;
  context: PluginContext;
  location: Location;
}

export interface PluginBlockImpl<Block extends ProtocolBlock, Location> {
  Component?: ComponentType<PluginBlockImplComponentProps<Block, Location>>;

  computeGraph?: ProtocolBlockGraphRenderer<Block, Location>;
  createEntries?(block: Block, location: Location | null, context: PluginContext): PluginBlockEntry[];
  createEntryMenu?(block: Block, entryId: OrdinaryId): MenuDef;
  getChildren?(block: Block, context: PluginContext): ProtocolBlock[];
  getChildrenExecution?(block: Block, location: Location, context: PluginContext): (PluginBlockExecutionRef | null)[];
  getLabel?(block: Block): ReactNode | null;
}

export interface PluginBlockExecutionRef {
  location: unknown;
}

export type UnknownPluginBlockImpl = PluginBlockImpl<any, any>;
