import * as React from 'react';

import type { ProtocolBlock } from './protocol';
import type { Point, Size } from '../geometry';
import type { Units } from './unit';
import type { GraphRenderSettings } from '../components/graph-editor';


export interface GraphBlockMetrics {
  start: Point;
  end: Point;

  size: Size;
}

export interface GraphRenderer<Block extends ProtocolBlock, Metrics extends GraphBlockMetrics> {
  computeMetrics(block: Block, options: GraphRendererComputeSizeOptions): Metrics;
  render(block: Block, metrics: Metrics, position: Point, options: RendererRenderOptions): React.ReactNode;
}

export interface GraphRendererComputeSizeOptions {
  computeMetrics(block: unknown): GraphBlockMetrics;
  settings: GraphRenderSettings;
  units: Units;
}

export interface RendererRenderOptions {
  render(block: unknown, metrics: unknown, position: Point): React.ReactNode;
  settings: GraphRenderSettings;
}
