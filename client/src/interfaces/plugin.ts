import type { ExecutionRef, ExecutionRefId, ExecutionRefPath, OrdinaryId, PluginName, ProtocolBlock, ProtocolBlockName, UnitNamespace } from 'pr1-shared';
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

export interface PluginBlockImpl<Block extends ProtocolBlock, Key extends OrdinaryId, Location> {
  Component?: ComponentType<PluginBlockImplComponentProps<Block, Location>>;

  computeGraph?: ProtocolBlockGraphRenderer<Block, Key, Location>;
  createEntries?(block: Block, location: Location | null, context: PluginContext): PluginBlockEntry[];
  createEntryMenu?(block: Block, entryId: OrdinaryId): MenuDef;
  getChild?(block: Block, key: Key): ProtocolBlock;
  getChildLocation?(block: Block, location: Location, refId: ExecutionRefId, context: PluginContext): unknown;
  getClassLabel?(block: Block): string;
  getExecutionRefPaths?(block: Block, location: Location, context: PluginContext): ExecutionRef[] | null;
  getLabel?(block: Block): ReactNode | null;
}

export type UnknownPluginBlockImpl = PluginBlockImpl<any, OrdinaryId, any>;
