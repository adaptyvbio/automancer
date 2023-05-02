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


export interface PluginBlockImplHeadComponentProps<Block extends ProtocolBlock, Location> {
  block: Block;
  location: Location | null;
  context: PluginContext;
}

export interface PluginBlockImpl<Block extends ProtocolBlock, Key extends OrdinaryId, Location> {
  HeadComponent?: ReactElement<PluginBlockImplHeadComponentProps<Block, Location>>;

  computeGraph?: ProtocolBlockGraphRenderer<Block, Key, Location>;
  createEntryMenu?(block: Block, entryId: OrdinaryId): MenuDef;
  getChild?(block: Block, key: Key): ProtocolBlock;
  getClassLabel?(block: Block): string;
  getLabel?(block: Block): string;
  // graphRenderer?: ProtocolBlockGraphRenderer<Block, Metrics, Location>;
  renderEntries(block: Block, location: Location | null): {
    entries: {
      id: OrdinaryId;
      features: Feature[];
    }[];
  };
}

export type UnknownPluginBlockImpl = PluginBlockImpl<any, OrdinaryId, any>;
