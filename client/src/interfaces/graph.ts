import type { MasterBlockLocation, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import type { ReactNode } from 'react';

import type { GraphRenderSettings } from '../components/graph-editor';
import type { Point, RectSurface, Size } from '../geometry';
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

export type ProtocolBlockGraphRenderer<Block extends ProtocolBlock, Location extends MasterBlockLocation = never> = (
  block: Block,
  path: ProtocolBlockPath,
  pairs: ProtocolBlockGraphPair[],
  group: ProtocolBlockGraphGroup,
  location: Location | null,
  options: {
    computeMetrics(key: number): ProtocolBlockGraphRendererMetrics;
    settings: GraphRenderSettings;
  },
  context: GlobalContext
) => ProtocolBlockGraphRendererMetrics;


export interface ProtocolBlockGraphPair {
  block: ProtocolBlock;
  location: MasterBlockLocation | null;
}

export interface ProtocolBlockGraphGroup {
  labels: ReactNode[];
  name: string | null;
  pairs: ProtocolBlockGraphPair[];
}
