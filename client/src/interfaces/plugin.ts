import type { OrdinaryId, PluginName, ProtocolBlock, ProtocolBlockName, UnitNamespace } from 'pr1-shared';
import type { ReactElement } from 'react';

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

export interface PluginBlockImplHeadComponentProps<Block extends ProtocolBlock, Location> {
  block: Block;
  location: Location | null;
  context: PluginContext;
}

export interface PluginBlockImpl<Block extends ProtocolBlock, Key extends OrdinaryId, Location> {
  HeadComponent?: ReactElement<PluginBlockImplHeadComponentProps<Block, Location>>;

  computeGraph?: ProtocolBlockGraphRenderer<Block, Key, Location>;
  createEntries?(block: Block, location: Location | null): PluginBlockEntry[];
  createEntryMenu?(block: Block, entryId: OrdinaryId): MenuDef;
  getChild?(block: Block, key: Key): ProtocolBlock;
  getClassLabel?(block: Block): string;
  getLabel?(block: Block): string;
  // getSingleChild?(block: Block): ProtocolBlock;
}

export type UnknownPluginBlockImpl = PluginBlockImpl<any, OrdinaryId, any>;
