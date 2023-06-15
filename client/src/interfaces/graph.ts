import type { ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import type { ReactNode } from 'react';

import type { Point, RectSurface, Size } from '../geometry';
import type { GraphRenderSettings } from '../components/graph-editor';
import type { Host } from '../host';
import type { UnitContext } from './unit';
import type { GlobalContext } from './plugin';


export interface ProtocolBlockGraphRendererNodeInfo {
  path: ProtocolBlockPath;
  surface: RectSurface;
}

export interface ProtocolBlockGraphRendererMetrics {
  start: Point;
  end: Point;

  compactable?: unknown;
  size: Size;

  render(position: Point, options: ProtocolBlockGraphRendererRenderOptions): {
    element: ReactNode;
    nodes: ProtocolBlockGraphRendererNodeInfo[];
  };
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
    computeMetrics(key: number): ProtocolBlockGraphRendererMetrics;
    settings: GraphRenderSettings;
  },
  context: GlobalContext
) => ProtocolBlockGraphRendererMetrics;
