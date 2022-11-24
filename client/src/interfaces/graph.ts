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
  computeMetrics(block: Block, options: GraphRendererComputeSizeOptions): Metrics;
  render(block: Block, path: ProtocolBlockPath, metrics: Metrics, position: Point, state: State | null, options: RendererRenderOptions): React.ReactNode;
}

export interface GraphRendererComputeSizeOptions {
  computeMetrics(block: unknown): GraphBlockMetrics;
  host: Host;
  settings: GraphRenderSettings;
}

export interface RendererRenderOptions {
  host: Host;
  render(block: unknown, path: ProtocolBlockPath, metrics: unknown, position: Point, state: unknown | null): React.ReactNode;
  settings: GraphRenderSettings;
}
