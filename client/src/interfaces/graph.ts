import * as React from 'react';

import type { ProtocolBlock, ProtocolBlockPath } from './protocol';
import type { Point, Size } from '../geometry';
import type { GraphRenderSettings } from '../components/graph-editor';
import type { Host } from '../host';
import { UnitContext } from './unit';


export interface GraphRendererDefaultMetrics {
  start: Point;
  end: Point;

  compactable?: unknown;
  size: Size;
}

export interface GraphRenderer<Block extends ProtocolBlock, Metrics, Location = never> {
  computeMetrics(
    block: Block,
    ancestors: ProtocolBlock[],
    location: Location | null,
    options: GraphRendererComputeMetricsOptions,
    context: UnitContext
  ): Metrics & GraphRendererDefaultMetrics;

  render(
    block: Block,
    path: ProtocolBlockPath,
    metrics: Metrics & GraphRendererDefaultMetrics,
    position: Point,
    location: Location | null,
    options: GraphRendererRenderOptions,
    context: UnitContext
  ): React.ReactNode;
}

export interface GraphRendererComputeMetricsOptions {
  computeMetrics(block: ProtocolBlock, ancestors: ProtocolBlock[], location: unknown | null): GraphRendererDefaultMetrics;
  settings: GraphRenderSettings;
}

export interface GraphRendererRenderOptions {
  attachmentEnd: boolean;
  attachmentStart: boolean;
  render(block: ProtocolBlock, path: ProtocolBlockPath, metrics: GraphRendererDefaultMetrics, position: Point, location: unknown | null, options: {
    attachmentEnd: boolean;
    attachmentStart: boolean;
  }): React.ReactNode;
  settings: GraphRenderSettings;
}
