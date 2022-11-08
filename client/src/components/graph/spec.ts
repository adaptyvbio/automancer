import * as React from 'react';

import { LinkEnd, Settings } from '../graph-editor';


export type Namespace = string;

export interface Coordinates {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface BaseBlock {
  id: string;
  type: string;
}

export interface BaseMetrics {
  start: LinkEnd;
  end: LinkEnd;

  size: Size;
}

export interface Renderer<Block extends BaseBlock, Metrics extends BaseMetrics> {
  computeMetrics(block: Block, options: RendererComputeSizeOptions): Metrics;
  render(block: Block, metrics: Metrics, position: Coordinates, options: RendererRenderOptions): React.ReactNode;
}

export interface RendererComputeSizeOptions {
  computeMetrics(block: unknown): BaseMetrics;
  settings: Settings;
}

export interface RendererRenderOptions {
  render(block: unknown, metrics: unknown, position: Coordinates): React.ReactNode;
  settings: Settings;
}

export type Renderers = Record<Namespace, Renderer<BaseBlock, BaseMetrics>>;
