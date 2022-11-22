import * as React from 'react';
import { Features } from '../../unit';

import { GraphNode } from '../graph-editor';
import { BaseBlock, GraphBlockMetrics, Namespace, GraphRenderer } from '../../interfaces/graph';


export default {
  computeMetrics(block, options) {
    let features = options.units[block.processNamespace].createProcessFeatures?.(block.processData, {}) ?? [
      { icon: 'not_listed_location', label: 'Unknown process' }
    ];

    let featureCount = features.length;
    let width = Math.round((220 + options.settings.nodePadding * 2) / options.settings.cellPixelSize);

    return {
      features,
      start: { x: 0, y: 1 },
      end: { x: width, y: 1 },
      size: {
        width,
        height: Math.ceil((
          options.settings.nodeHeaderHeight
          + (24 * featureCount)
          + (5.6 * (featureCount - 1))
          + (options.settings.nodeBodyPaddingY * 2)
          + (options.settings.nodePadding * 2)
        ) / options.settings.cellPixelSize)
      }
    };
  },
  render(block, metrics, position, options) {
    return (
      <GraphNode
        autoMove={false}
        cellSize={{
          width: metrics.size.width,
          height: metrics.size.height
        }}
        node={{
          id: 'a',
          title: block.label,
          features: metrics.features,
          position
        }}
        selected={false}
        settings={options.settings} />
    );
  }
} as GraphRenderer<BaseBlock & {
  label: string | null;
  processData: unknown;
  processNamespace: Namespace;
  state: Record<Namespace, unknown>;
}, GraphBlockMetrics & {
  features: Features;
}>;
