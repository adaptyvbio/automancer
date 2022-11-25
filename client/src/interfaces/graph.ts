import * as React from 'react';

import type { ProtocolBlock, ProtocolBlockPath } from './protocol';
import type { Point, Size } from '../geometry';
import type { Units } from './unit';
import type { GraphRenderSettings } from '../components/graph-editor';
import type { Host } from '../host';


export interface GraphBlockMetrics {
  start: Point;
  end: Point;

  size: Size;
}

export interface GraphRenderer<Block extends ProtocolBlock, Metrics extends GraphBlockMetrics, State = unknown> {
  computeMetrics(block: Block, ancestors: ProtocolBlock[], options: GraphRendererComputeSizeOptions): Metrics;
  render(block: Block, path: ProtocolBlockPath, metrics: Metrics, position: Point, state: State | null, options: RendererRenderOptions): React.ReactNode;
}

export interface GraphRendererComputeSizeOptions {
  computeMetrics(block: ProtocolBlock, ancestors: ProtocolBlock[]): GraphBlockMetrics;
  host: Host;
  settings: GraphRenderSettings;
}

export interface RendererRenderOptions {
  host: Host;
  render(block: ProtocolBlock, path: ProtocolBlockPath, metrics: GraphBlockMetrics, position: Point, state: unknown | null): React.ReactNode;
  settings: GraphRenderSettings;
}
