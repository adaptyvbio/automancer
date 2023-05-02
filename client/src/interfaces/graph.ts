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

// export interface ProtocolBlockGraphRenderer<Block extends ProtocolBlock, Metrics, Location = never> {
//   computeMetrics(
//     block: Block,
//     ancestors: ProtocolBlock[],
//     location: Location | null,
//     options: ProtocolBlockGraphRendererComputeMetricsOptions,
//     context: PluginContext
//   ): Metrics & ProtocolBlockGraphRendererMetrics;

//   render(
//     block: Block,
//     path: ProtocolBlockPath,
//     metrics: Metrics & ProtocolBlockGraphRendererMetrics,
//     position: Point,
//     location: Location | null,
//     options: ProtocolBlockGraphRendererRenderOptions,
//     context: PluginContext
//   ): ReactNode;
// }

// export interface ProtocolBlockGraphRendererComputeMetricsOptions {
//   computeMetrics(block: ProtocolBlock, /* ancestors: ProtocolBlock[], */ location: unknown | null): ProtocolBlockGraphRendererMetrics;
//   settings: GraphRenderSettings;
// }

export interface ProtocolBlockGraphRendererRenderOptions {
  attachmentEnd: boolean;
  attachmentStart: boolean;
  // render(block: ProtocolBlock, path: ProtocolBlockPath, metrics: ProtocolBlockGraphRendererMetrics, position: Point, location: unknown | null, options: {
  //   attachmentEnd: boolean;
  //   attachmentStart: boolean;
  // }): ReactNode;
}


export type ProtocolBlockGraphRenderer<Block extends ProtocolBlock, Key extends OrdinaryId, Location = never> = (
  block: Block,
  path: ProtocolBlockPath,
  ancestors: ProtocolBlock[],
  location: Location | null,
  options: {
    computeMetrics(key: Key, location: unknown | null): ProtocolBlockGraphRendererMetrics;
    settings: GraphRenderSettings;
  },
  context: PluginContext
) => ProtocolBlockGraphRendererMetrics;
