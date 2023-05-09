import type { OrdinaryId, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import type { ReactNode } from 'react';

import type { Point, Size } from '../geometry';
import type { GraphRenderSettings } from '../components/graph-editor';
import type { PluginContext } from './plugin';


export interface ProtocolBlockGraphRendererMetrics {
  start: Point;
  end: Point;

  compactable?: unknown;
  size: Size;

  render(position: Point, options: ProtocolBlockGraphRendererRenderOptions): ReactNode;
}

export interface ProtocolBlockGraphRendererRenderOptions {
  attachmentEnd: boolean;
  attachmentStart: boolean;
}

export type ProtocolBlockGraphRenderer<Block extends ProtocolBlock, Location = never> = (
  block: Block,
  path: ProtocolBlockPath,
  ancestors: ProtocolBlock[],
  location: Location | null,
  options: {
    computeMetrics(index: number, location: unknown | null): ProtocolBlockGraphRendererMetrics;
    settings: GraphRenderSettings;
  },
  context: PluginContext
) => ProtocolBlockGraphRendererMetrics;
